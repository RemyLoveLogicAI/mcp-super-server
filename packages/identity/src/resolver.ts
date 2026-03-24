/**
 * @mss/identity - Identity Resolver
 * Whitepaper §4.2.7 + Innovation #4
 *
 * Patent Surface: Cross-Platform Identity Mesh
 * - Agent-orchestrated resolution
 * - Policy-scoped linking
 * - Agentic session continuity
 * - Inventory/achievement persistence across platforms
 *
 * NO BIOMETRICS: Identity linking via OAuth/tokens/user action only
 */

import { z } from "zod";
import { EventLedger } from "@mss/core/contracts/ledger";
import { IdentityLinked, IdentityUnlinked } from "@mss/core/events/identity";
import {
  CanonicalIdentityResource,
  LinkedIdentity,
  SharedState,
} from "@mss/core/resources/identity";
import {
  UUID,
  CanonicalUserId,
  PlatformIdentityId,
  EventId,
} from "@mss/core/ids";

// ============================================================================
// Types
// ============================================================================

export const SupportedPlatform = z.enum([
  "discord",
  "telegram",
  "whatsapp",
  "slack",
  "web",
  "mobile_ios",
  "mobile_android",
  "rabbit_r1",
  "humane_pin",
  "custom",
]);
export type SupportedPlatform = z.infer<typeof SupportedPlatform>;

export const LinkingProof = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("oauth"),
    provider: z.string(),
    access_token_hash: z.string(),
    expires_at: z.string().optional(),
  }),
  z.object({
    type: z.literal("verification_code"),
    code_hash: z.string(),
    verified_at: z.string(),
  }),
  z.object({
    type: z.literal("trusted_assertion"),
    asserter: z.string(),
    assertion_id: z.string(),
  }),
  z.object({
    type: z.literal("user_action"),
    action: z.string(),
    confirmed_at: z.string(),
  }),
]);
export type LinkingProof = z.infer<typeof LinkingProof>;

export interface LinkRequest {
  canonical_user_id?: CanonicalUserId;
  platform: SupportedPlatform;
  platform_identity_id: PlatformIdentityId;
  proof: LinkingProof;
  initiated_by: "user" | "agent" | "system";
}

export interface UnlinkRequest {
  canonical_user_id: CanonicalUserId;
  platform: SupportedPlatform;
  platform_identity_id: PlatformIdentityId;
  reason: string;
  initiated_by: "user" | "agent" | "system";
}

export interface ResolveResult {
  canonical_user_id: CanonicalUserId;
  identity: CanonicalIdentityResource;
  matched_by: {
    platform: SupportedPlatform;
    platform_identity_id: PlatformIdentityId;
  };
  is_new: boolean;
}

// ============================================================================
// Identity Store Interface
// ============================================================================

export interface IdentityStore {
  /** Get identity by canonical ID */
  get(id: CanonicalUserId): Promise<CanonicalIdentityResource | null>;

  /** Find identity by platform identity */
  findByPlatformId(
    platform: SupportedPlatform,
    platformId: PlatformIdentityId
  ): Promise<CanonicalIdentityResource | null>;

  /** Create new canonical identity */
  create(identity: CanonicalIdentityResource): Promise<void>;

  /** Update existing identity */
  update(identity: CanonicalIdentityResource): Promise<void>;

  /** Add linked identity */
  addLink(
    canonicalId: CanonicalUserId,
    link: LinkedIdentity
  ): Promise<void>;

  /** Remove linked identity */
  removeLink(
    canonicalId: CanonicalUserId,
    platform: SupportedPlatform,
    platformId: PlatformIdentityId
  ): Promise<void>;
}

// ============================================================================
// In-Memory Identity Store
// ============================================================================

export class InMemoryIdentityStore implements IdentityStore {
  private identities: Map<CanonicalUserId, CanonicalIdentityResource> = new Map();
  private platformIndex: Map<string, CanonicalUserId> = new Map();

  private platformKey(platform: SupportedPlatform, platformId: PlatformIdentityId): string {
    return `${platform}:${platformId}`;
  }

  async get(id: CanonicalUserId): Promise<CanonicalIdentityResource | null> {
    return this.identities.get(id) ?? null;
  }

  async findByPlatformId(
    platform: SupportedPlatform,
    platformId: PlatformIdentityId
  ): Promise<CanonicalIdentityResource | null> {
    const canonicalId = this.platformIndex.get(this.platformKey(platform, platformId));
    if (!canonicalId) return null;
    return this.get(canonicalId);
  }

  async create(identity: CanonicalIdentityResource): Promise<void> {
    this.identities.set(identity.canonical_user_id as CanonicalUserId, identity);
    for (const link of identity.linked_identities) {
      this.platformIndex.set(
        this.platformKey(link.platform as SupportedPlatform, link.platform_identity_id),
        identity.canonical_user_id as CanonicalUserId
      );
    }
  }

  async update(identity: CanonicalIdentityResource): Promise<void> {
    const existing = this.identities.get(identity.canonical_user_id as CanonicalUserId);
    if (existing) {
      // Remove old platform index entries
      for (const link of existing.linked_identities) {
        this.platformIndex.delete(
          this.platformKey(link.platform as SupportedPlatform, link.platform_identity_id)
        );
      }
    }
    // Add new entries
    await this.create(identity);
  }

  async addLink(canonicalId: CanonicalUserId, link: LinkedIdentity): Promise<void> {
    const identity = await this.get(canonicalId);
    if (!identity) throw new Error(`Identity ${canonicalId} not found`);

    identity.linked_identities.push(link);
    identity.updated_at = new Date().toISOString();
    this.platformIndex.set(
      this.platformKey(link.platform as SupportedPlatform, link.platform_identity_id),
      canonicalId
    );
  }

  async removeLink(
    canonicalId: CanonicalUserId,
    platform: SupportedPlatform,
    platformId: PlatformIdentityId
  ): Promise<void> {
    const identity = await this.get(canonicalId);
    if (!identity) throw new Error(`Identity ${canonicalId} not found`);

    identity.linked_identities = identity.linked_identities.filter(
      (l: LinkedIdentity) => !(l.platform === platform && l.platform_identity_id === platformId)
    );
    identity.updated_at = new Date().toISOString();
    this.platformIndex.delete(this.platformKey(platform, platformId));
  }

  /** Clear all data (for testing) */
  clear(): void {
    this.identities.clear();
    this.platformIndex.clear();
  }

  /** Get identity count (for testing) */
  count(): number {
    return this.identities.size;
  }
}

// ============================================================================
// Identity Resolver
// ============================================================================

export class IdentityResolver {
  private store: IdentityStore;
  private ledger?: EventLedger;

  constructor(store: IdentityStore, ledger?: EventLedger) {
    this.store = store;
    if (ledger !== undefined) this.ledger = ledger;
  }

  /**
   * Resolve a platform identity to a canonical identity.
   * Creates a new canonical identity if none exists.
   */
  async resolve(
    platform: SupportedPlatform,
    platformId: PlatformIdentityId
  ): Promise<ResolveResult> {
    // Try to find existing identity
    const existing = await this.store.findByPlatformId(platform, platformId);

    if (existing) {
      return {
        canonical_user_id: existing.canonical_user_id as CanonicalUserId,
        identity: existing,
        matched_by: { platform, platform_identity_id: platformId },
        is_new: false,
      };
    }

    // Create new canonical identity
    const canonicalId = crypto.randomUUID() as CanonicalUserId;
    const now = new Date().toISOString();

    const newIdentity: CanonicalIdentityResource = {
      canonical_user_id: canonicalId,
      linked_identities: [
        {
          platform,
          platform_identity_id: platformId,
          linked_at: now,
          verified: false,
          last_seen_at: now,
        },
      ],
      shared_state: {
        inventory_ref: undefined,
        achievements_ref: undefined,
        narrative_history_ref: undefined,
        preferences: {},
      },
      created_at: now,
      updated_at: now,
      display_name: undefined,
      avatar_url: undefined,
    };

    await this.store.create(newIdentity);

    return {
      canonical_user_id: canonicalId,
      identity: newIdentity,
      matched_by: { platform, platform_identity_id: platformId },
      is_new: true,
    };
  }

  /**
   * Get a canonical identity by ID.
   */
  async get(canonicalId: CanonicalUserId): Promise<CanonicalIdentityResource | null> {
    return this.store.get(canonicalId);
  }

  /**
   * Link a platform identity to an existing canonical identity.
   */
  async link(request: LinkRequest): Promise<CanonicalIdentityResource> {
    const now = new Date().toISOString();

    // Check if platform identity is already linked elsewhere
    const existingLink = await this.store.findByPlatformId(
      request.platform,
      request.platform_identity_id
    );
    if (existingLink) {
      throw new Error(
        `Platform identity ${request.platform}:${request.platform_identity_id} is already linked to ${existingLink.canonical_user_id}`
      );
    }

    let canonicalId: CanonicalUserId;
    let identity: CanonicalIdentityResource;

    if (request.canonical_user_id) {
      // Link to existing identity
      const existing = await this.store.get(request.canonical_user_id);
      if (!existing) {
        throw new Error(`Canonical identity ${request.canonical_user_id} not found`);
      }
      canonicalId = request.canonical_user_id;
      identity = existing;
    } else {
      // Create new canonical identity
      canonicalId = crypto.randomUUID() as CanonicalUserId;
      identity = {
        canonical_user_id: canonicalId,
        linked_identities: [],
        shared_state: {
          inventory_ref: undefined,
          achievements_ref: undefined,
          narrative_history_ref: undefined,
          preferences: {},
        },
        created_at: now,
        updated_at: now,
        display_name: undefined,
        avatar_url: undefined,
      };
      await this.store.create(identity);
    }

    // Add the link
    const link: LinkedIdentity = {
      platform: request.platform,
      platform_identity_id: request.platform_identity_id,
      linked_at: now,
      verified: request.proof.type === "oauth" || request.proof.type === "verification_code",
      last_seen_at: now,
    };

    await this.store.addLink(canonicalId, link);

    // Emit event
    if (this.ledger) {
      const event: IdentityLinked = {
        event_id: crypto.randomUUID() as EventId,
        event_type: "identity.linked",
        timestamp: now,
        actor: { canonical_user_id: canonicalId as string },
        canonical_user_id: canonicalId,
        platform: request.platform,
        platform_identity_id: request.platform_identity_id,
        proof: request.proof,
        initiated_by: request.initiated_by,
      };
      await this.ledger.append(event);
    }

    // Return updated identity
    return (await this.store.get(canonicalId))!;
  }

  /**
   * Unlink a platform identity from a canonical identity.
   */
  async unlink(request: UnlinkRequest): Promise<CanonicalIdentityResource> {
    const identity = await this.store.get(request.canonical_user_id);
    if (!identity) {
      throw new Error(`Canonical identity ${request.canonical_user_id} not found`);
    }

    // Check if link exists
    const linkExists = identity.linked_identities.some(
      (l: LinkedIdentity) =>
        l.platform === request.platform &&
        l.platform_identity_id === request.platform_identity_id
    );
    if (!linkExists) {
      throw new Error(
        `Platform identity ${request.platform}:${request.platform_identity_id} is not linked to ${request.canonical_user_id}`
      );
    }

    // Prevent unlinking the last identity
    if (identity.linked_identities.length === 1) {
      throw new Error("Cannot unlink the last platform identity");
    }

    // Remove the link
    await this.store.removeLink(
      request.canonical_user_id,
      request.platform,
      request.platform_identity_id
    );

    // Emit event
    if (this.ledger) {
      const event: IdentityUnlinked = {
        event_id: crypto.randomUUID() as EventId,
        event_type: "identity.unlinked",
        timestamp: new Date().toISOString(),
        actor: { canonical_user_id: request.canonical_user_id as string },
        canonical_user_id: request.canonical_user_id,
        platform: request.platform,
        platform_identity_id: request.platform_identity_id,
        reason: request.reason,
        initiated_by: request.initiated_by,
      };
      await this.ledger.append(event);
    }

    // Return updated identity
    return (await this.store.get(request.canonical_user_id))!;
  }

  /**
   * Update shared state for a canonical identity.
   */
  async updateSharedState(
    canonicalId: CanonicalUserId,
    updates: Partial<SharedState>
  ): Promise<CanonicalIdentityResource> {
    const identity = await this.store.get(canonicalId);
    if (!identity) {
      throw new Error(`Canonical identity ${canonicalId} not found`);
    }

    identity.shared_state = {
      ...identity.shared_state,
      ...updates,
    };
    identity.updated_at = new Date().toISOString();

    await this.store.update(identity);

    return identity;
  }

  /**
   * Update display info for a canonical identity.
   */
  async updateProfile(
    canonicalId: CanonicalUserId,
    updates: { display_name?: string; avatar_url?: string }
  ): Promise<CanonicalIdentityResource> {
    const identity = await this.store.get(canonicalId);
    if (!identity) {
      throw new Error(`Canonical identity ${canonicalId} not found`);
    }

    if (updates.display_name !== undefined) {
      identity.display_name = updates.display_name;
    }
    if (updates.avatar_url !== undefined) {
      identity.avatar_url = updates.avatar_url;
    }
    identity.updated_at = new Date().toISOString();

    await this.store.update(identity);

    return identity;
  }

  /**
   * Record activity on a linked identity.
   */
  async recordActivity(
    platform: SupportedPlatform,
    platformId: PlatformIdentityId
  ): Promise<void> {
    const identity = await this.store.findByPlatformId(platform, platformId);
    if (!identity) return;

    const link = identity.linked_identities.find(
      (l: LinkedIdentity) => l.platform === platform && l.platform_identity_id === platformId
    );
    if (link) {
      link.last_seen_at = new Date().toISOString();
      await this.store.update(identity);
    }
  }

  /**
   * Get all platforms linked to a canonical identity.
   */
  async getLinkedPlatforms(
    canonicalId: CanonicalUserId
  ): Promise<Array<{ platform: SupportedPlatform; platform_identity_id: PlatformIdentityId }>> {
    const identity = await this.store.get(canonicalId);
    if (!identity) return [];

    return identity.linked_identities.map((l: LinkedIdentity) => ({
      platform: l.platform as SupportedPlatform,
      platform_identity_id: l.platform_identity_id,
    }));
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createIdentityResolver(
  store?: IdentityStore,
  ledger?: EventLedger
): IdentityResolver {
  return new IdentityResolver(store ?? new InMemoryIdentityStore(), ledger);
}

export function createInMemoryIdentityStore(): InMemoryIdentityStore {
  return new InMemoryIdentityStore();
}
