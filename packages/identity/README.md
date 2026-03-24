# @mss/identity — Identity Mesh

**Whitepaper mapping:** §4.2.7 Identity Mesh + Innovation #4

## Responsibilities

- Canonical identity resolution
- Platform identity linking/unlinking
- Shared state across platforms (inventory, achievements, history)
- Linking policy enforcement

## Patent Surface

**Innovation #4: Cross-Platform Identity Mesh**

A system that:
- Links channel identities to a canonical identity
- Uses proofs + policy rules for linking/unlinking
- Supports shared inventory/achievements/history across channels
- Does NOT require biometrics

Key differentiator: Identity continuity is native to the platform, not an app-level afterthought.

## Contracts Used

- `@mss/core/events` — `IdentityLinked`, `IdentityUnlinked`
- `@mss/core/resources` — `CanonicalIdentityResource`, `LinkedIdentity`, `SharedState`

## Scope (Patent Claim Safety)

Identity mesh claims are scoped to:
- Agent-orchestrated identity resolution
- Policy-scoped identity linking
- Identity continuity across **agentic sessions**
- Inventory/achievement persistence tied to canonical identity

This avoids collision with general-purpose federated identity (SAML/OAuth/DID).

## No Biometrics

Voiceprint and other biometrics are explicitly excluded from this package.
Identity linking is performed via OAuth, platform tokens, or explicit user action.
