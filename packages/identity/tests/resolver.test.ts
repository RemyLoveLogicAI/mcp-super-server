/**
 * @mss/identity - Identity Resolver Unit Tests
 */

import { describe, it, beforeEach, expect } from "vitest";
import {
  IdentityResolver,
  InMemoryIdentityStore,
  SupportedPlatform,
  createIdentityResolver,
  createInMemoryIdentityStore,
} from "../src/resolver";
import { createInMemoryLedger } from "@mss/ledger";
import type { CanonicalUserId, PlatformIdentityId } from "@mss/core/ids";

describe("IdentityResolver", () => {
  let store: InMemoryIdentityStore;
  let resolver: IdentityResolver;

  beforeEach(() => {
    store = createInMemoryIdentityStore();
    resolver = createIdentityResolver(store);
  });

  describe("resolve", () => {
    it("should create new identity for unknown platform ID", async () => {
      const result = await resolver.resolve(
        "discord",
        "user123" as PlatformIdentityId
      );

      expect(result.is_new).toBe(true);
      expect(result.canonical_user_id).toBeTruthy();
      expect(result.identity.linked_identities).toHaveLength(1);
      expect(result.matched_by.platform).toBe("discord");
      expect(result.matched_by.platform_identity_id).toBe("user123");
    });

    it("should return existing identity for known platform ID", async () => {
      // First resolution creates identity
      const first = await resolver.resolve(
        "discord",
        "user123" as PlatformIdentityId
      );

      // Second resolution returns same identity
      const second = await resolver.resolve(
        "discord",
        "user123" as PlatformIdentityId
      );

      expect(second.is_new).toBe(false);
      expect(second.canonical_user_id).toBe(first.canonical_user_id);
    });

    it("should create separate identities for different platform IDs", async () => {
      const first = await resolver.resolve(
        "discord",
        "user1" as PlatformIdentityId
      );
      const second = await resolver.resolve(
        "discord",
        "user2" as PlatformIdentityId
      );

      expect(first.canonical_user_id).not.toBe(second.canonical_user_id);
    });
  });

  describe("get", () => {
    it("should return null for unknown canonical ID", async () => {
      const result = await resolver.get("unknown" as CanonicalUserId);
      expect(result).toBeNull();
    });

    it("should return identity for known canonical ID", async () => {
      const resolved = await resolver.resolve(
        "discord",
        "user123" as PlatformIdentityId
      );

      const identity = await resolver.get(resolved.canonical_user_id);

      expect(identity).toBeTruthy();
      expect(identity!.canonical_user_id).toBe(resolved.canonical_user_id);
    });
  });

  describe("link", () => {
    it("should link platform identity to existing canonical identity", async () => {
      // Create initial identity
      const resolved = await resolver.resolve(
        "discord",
        "discord123" as PlatformIdentityId
      );

      // Link telegram to same canonical identity
      const updated = await resolver.link({
        canonical_user_id: resolved.canonical_user_id,
        platform: "telegram",
        platform_identity_id: "telegram456" as PlatformIdentityId,
        proof: { type: "user_action", action: "confirm", confirmed_at: new Date().toISOString() },
        initiated_by: "user",
      });

      expect(updated.linked_identities).toHaveLength(2);
      expect(updated.linked_identities.map((l) => l.platform)).toContain("telegram");
    });

    it("should create new canonical identity if none specified", async () => {
      const identity = await resolver.link({
        platform: "telegram",
        platform_identity_id: "new_user" as PlatformIdentityId,
        proof: { type: "oauth", provider: "telegram", access_token_hash: "abc" },
        initiated_by: "system",
      });

      expect(identity.canonical_user_id).toBeTruthy();
      expect(identity.linked_identities).toHaveLength(1);
    });

    it("should throw if platform identity already linked elsewhere", async () => {
      // Create first identity with discord
      await resolver.resolve("discord", "shared_id" as PlatformIdentityId);

      // Create second identity
      const second = await resolver.resolve(
        "telegram",
        "telegram123" as PlatformIdentityId
      );

      // Try to link same discord to second identity
      await expect(
        resolver.link({
          canonical_user_id: second.canonical_user_id,
          platform: "discord",
          platform_identity_id: "shared_id" as PlatformIdentityId,
          proof: { type: "user_action", action: "confirm", confirmed_at: new Date().toISOString() },
          initiated_by: "user",
        })
      ).rejects.toThrow("already linked");
    });

    it("should throw if canonical identity not found", async () => {
      await expect(
        resolver.link({
          canonical_user_id: "nonexistent" as CanonicalUserId,
          platform: "discord",
          platform_identity_id: "user123" as PlatformIdentityId,
          proof: { type: "user_action", action: "confirm", confirmed_at: new Date().toISOString() },
          initiated_by: "user",
        })
      ).rejects.toThrow("not found");
    });

    it("should mark identity as verified for oauth proofs", async () => {
      const identity = await resolver.link({
        platform: "discord",
        platform_identity_id: "oauth_user" as PlatformIdentityId,
        proof: { type: "oauth", provider: "discord", access_token_hash: "xyz" },
        initiated_by: "system",
      });

      expect(identity.linked_identities[0].verified).toBe(true);
    });
  });

  describe("unlink", () => {
    it("should remove platform identity from canonical identity", async () => {
      // Create identity with two platforms
      const resolved = await resolver.resolve(
        "discord",
        "discord123" as PlatformIdentityId
      );
      await resolver.link({
        canonical_user_id: resolved.canonical_user_id,
        platform: "telegram",
        platform_identity_id: "telegram456" as PlatformIdentityId,
        proof: { type: "user_action", action: "confirm", confirmed_at: new Date().toISOString() },
        initiated_by: "user",
      });

      // Unlink telegram
      const updated = await resolver.unlink({
        canonical_user_id: resolved.canonical_user_id,
        platform: "telegram",
        platform_identity_id: "telegram456" as PlatformIdentityId,
        reason: "user request",
        initiated_by: "user",
      });

      expect(updated.linked_identities).toHaveLength(1);
      expect(updated.linked_identities[0].platform).toBe("discord");
    });

    it("should throw if trying to unlink last identity", async () => {
      const resolved = await resolver.resolve(
        "discord",
        "only_one" as PlatformIdentityId
      );

      await expect(
        resolver.unlink({
          canonical_user_id: resolved.canonical_user_id,
          platform: "discord",
          platform_identity_id: "only_one" as PlatformIdentityId,
          reason: "test",
          initiated_by: "user",
        })
      ).rejects.toThrow("Cannot unlink the last");
    });

    it("should throw if link does not exist", async () => {
      const resolved = await resolver.resolve(
        "discord",
        "discord123" as PlatformIdentityId
      );

      await expect(
        resolver.unlink({
          canonical_user_id: resolved.canonical_user_id,
          platform: "telegram",
          platform_identity_id: "nonexistent" as PlatformIdentityId,
          reason: "test",
          initiated_by: "user",
        })
      ).rejects.toThrow("not linked");
    });
  });

  describe("updateSharedState", () => {
    it("should update shared state fields", async () => {
      const resolved = await resolver.resolve(
        "discord",
        "user123" as PlatformIdentityId
      );

      const updated = await resolver.updateSharedState(resolved.canonical_user_id, {
        inventory_ref: "inv:abc123",
        achievements_ref: "ach:xyz789",
        preferences: { theme: "dark" },
      });

      expect(updated.shared_state.inventory_ref).toBe("inv:abc123");
      expect(updated.shared_state.achievements_ref).toBe("ach:xyz789");
      expect(updated.shared_state.preferences).toEqual({ theme: "dark" });
    });

    it("should merge preferences", async () => {
      const resolved = await resolver.resolve(
        "discord",
        "user123" as PlatformIdentityId
      );

      await resolver.updateSharedState(resolved.canonical_user_id, {
        preferences: { theme: "dark" },
      });

      const updated = await resolver.updateSharedState(resolved.canonical_user_id, {
        preferences: { language: "en" },
      });

      expect(updated.shared_state.preferences).toEqual({ language: "en" });
    });
  });

  describe("updateProfile", () => {
    it("should update display name and avatar", async () => {
      const resolved = await resolver.resolve(
        "discord",
        "user123" as PlatformIdentityId
      );

      const updated = await resolver.updateProfile(resolved.canonical_user_id, {
        display_name: "Test User",
        avatar_url: "https://example.com/avatar.png",
      });

      expect(updated.display_name).toBe("Test User");
      expect(updated.avatar_url).toBe("https://example.com/avatar.png");
    });
  });

  describe("recordActivity", () => {
    it("should update last_seen_at for linked identity", async () => {
      const resolved = await resolver.resolve(
        "discord",
        "user123" as PlatformIdentityId
      );
      const originalLastSeen = resolved.identity.linked_identities[0].last_seen_at;

      // Wait a bit to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await resolver.recordActivity("discord", "user123" as PlatformIdentityId);

      const updated = await resolver.get(resolved.canonical_user_id);
      expect(updated!.linked_identities[0].last_seen_at).not.toBe(originalLastSeen);
    });
  });

  describe("getLinkedPlatforms", () => {
    it("should return all linked platforms", async () => {
      const resolved = await resolver.resolve(
        "discord",
        "discord123" as PlatformIdentityId
      );
      await resolver.link({
        canonical_user_id: resolved.canonical_user_id,
        platform: "telegram",
        platform_identity_id: "telegram456" as PlatformIdentityId,
        proof: { type: "user_action", action: "confirm", confirmed_at: new Date().toISOString() },
        initiated_by: "user",
      });

      const platforms = await resolver.getLinkedPlatforms(resolved.canonical_user_id);

      expect(platforms).toHaveLength(2);
      expect(platforms.map((p) => p.platform)).toContain("discord");
      expect(platforms.map((p) => p.platform)).toContain("telegram");
    });

    it("should return empty array for unknown identity", async () => {
      const platforms = await resolver.getLinkedPlatforms("unknown" as CanonicalUserId);
      expect(platforms).toHaveLength(0);
    });
  });
});

describe("IdentityResolver with ledger", () => {
  it("should emit events to ledger on link/unlink", async () => {
    const store = createInMemoryIdentityStore();
    const ledger = createInMemoryLedger();
    const resolver = createIdentityResolver(store, ledger);

    // Create identity
    const resolved = await resolver.resolve(
      "discord",
      "discord123" as PlatformIdentityId
    );

    // Link second platform
    await resolver.link({
      canonical_user_id: resolved.canonical_user_id,
      platform: "telegram",
      platform_identity_id: "telegram456" as PlatformIdentityId,
      proof: { type: "user_action", action: "confirm", confirmed_at: new Date().toISOString() },
      initiated_by: "user",
    });

    // Unlink
    await resolver.unlink({
      canonical_user_id: resolved.canonical_user_id,
      platform: "telegram",
      platform_identity_id: "telegram456" as PlatformIdentityId,
      reason: "test",
      initiated_by: "user",
    });

    // Check ledger
    expect(ledger.count()).toBe(2);

    const events = await ledger.replay({});
    expect(events[0].event.event_type).toBe("identity.linked");
    expect(events[1].event.event_type).toBe("identity.unlinked");
  });
});

describe("InMemoryIdentityStore", () => {
  let store: InMemoryIdentityStore;

  beforeEach(() => {
    store = createInMemoryIdentityStore();
  });

  it("should track identity count", async () => {
    const resolver = createIdentityResolver(store);

    expect(store.count()).toBe(0);

    await resolver.resolve("discord", "user1" as PlatformIdentityId);
    expect(store.count()).toBe(1);

    await resolver.resolve("discord", "user2" as PlatformIdentityId);
    expect(store.count()).toBe(2);
  });

  it("should clear all data", async () => {
    const resolver = createIdentityResolver(store);

    await resolver.resolve("discord", "user1" as PlatformIdentityId);
    await resolver.resolve("discord", "user2" as PlatformIdentityId);

    store.clear();

    expect(store.count()).toBe(0);
  });
});
