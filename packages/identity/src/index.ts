/**
 * @mss/identity — Identity Mesh
 * Whitepaper §4.2.7 + Innovation #4
 * 
 * This package will implement:
 * - Canonical identity resolution
 * - Platform identity linking/unlinking
 * - Shared state management
 * - Linking policy enforcement
 * 
 * NO BIOMETRICS. Identity linking uses OAuth/tokens/user action.
 */

// Re-export core types
export type { 
  IdentityLinked, 
  IdentityUnlinked 
} from "@mss/core/events";

export type { 
  CanonicalIdentityResource, 
  LinkedIdentity, 
  SharedState 
} from "@mss/core/resources";

// ─────────────────────────────────────────────────────────────────────────────
// Identity Resolver implementation
// ─────────────────────────────────────────────────────────────────────────────

export { IdentityResolver, InMemoryIdentityStore, createIdentityResolver, createInMemoryIdentityStore } from "./resolver.js";
export type { SupportedPlatform, LinkingProof, LinkRequest, UnlinkRequest, ResolveResult, IdentityStore } from "./resolver.js";
