/**
 * Canonical Identity Resource.
 * Whitepaper §6: Cross-Platform Identity Mesh (Innovation #4)
 * 
 * The identity mesh resolves multiple platform identities
 * into a single canonical identity. Exposed at:
 *   /identity/users/{canonical_user_id}
 */

import { z } from "../schemas/zod";

// ─────────────────────────────────────────────────────────────────────────────
// Linked Identity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A platform identity linked to a canonical identity.
 */
export const LinkedIdentity = z.object({
  /** Platform name (discord, telegram, whatsapp, r1, web, etc.) */
  platform: z.string(),
  
  /** Platform-specific user identifier */
  platform_identity_id: z.string(),
  
  /** When this identity was linked */
  linked_at: z.string(),
  
  /** Whether this link is verified */
  verified: z.boolean().optional(),
  
  /** Last seen on this platform */
  last_seen_at: z.string().optional()
});

export type LinkedIdentity = z.infer<typeof LinkedIdentity>;

// ─────────────────────────────────────────────────────────────────────────────
// Shared State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * State that persists across all linked identities.
 * This is what makes cross-platform continuity work.
 */
export const SharedState = z.object({
  /** Reference to inventory storage */
  inventory_ref: z.string().optional(),
  
  /** Reference to achievements storage */
  achievements_ref: z.string().optional(),
  
  /** Reference to narrative history storage */
  narrative_history_ref: z.string().optional(),
  
  /** User preferences */
  preferences: z.record(z.string(), z.any()).optional()
});

export type SharedState = z.infer<typeof SharedState>;

// ─────────────────────────────────────────────────────────────────────────────
// Canonical Identity Resource
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Protocol resource representing a canonical identity.
 * This is the single source of truth for a user's identity.
 */
export const CanonicalIdentityResource = z.object({
  /** Canonical user identifier */
  canonical_user_id: z.string(),
  
  /** All linked platform identities */
  linked_identities: z.array(LinkedIdentity),
  
  /** Shared state across all platforms */
  shared_state: SharedState,
  
  /** When this identity was created */
  created_at: z.string().optional(),
  
  /** When this identity was last updated */
  updated_at: z.string().optional(),
  
  /** Display name (user-chosen) */
  display_name: z.string().optional(),
  
  /** Avatar URL */
  avatar_url: z.string().optional()
});

export type CanonicalIdentityResource = z.infer<typeof CanonicalIdentityResource>;
