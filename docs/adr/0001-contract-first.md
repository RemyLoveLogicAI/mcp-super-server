# ADR 0001: Contract-First Artifacts

**Status:** Accepted  
**Date:** 2026-02-03

## Context

We need to prevent architecture drift between the canonical whitepaper/patent and implementation code. Teams historically introduce ad-hoc primitives during implementation that break the patent claim surfaces and complicate maintenance.

## Decision

We lock types and interfaces in `packages/core` **before** any implementation begins.

## Rationale

1. **Prevent architecture drift** — Implementation cannot invent new event types, resources, or contracts
2. **Allow parallel development** — Multiple engineers can work on different packages with stable contracts
3. **Preserve patent surfaces** — The four core innovations remain structurally defensible
4. **Enable contract testing** — Implementations can be validated against Zod schemas

## Scope

The following MUST be defined in `@mss/core` before implementation:

- Core events (Whitepaper §12)
- Resource schemas (Whitepaper §4.2 + §5)
- Tool call contract (Whitepaper §5 Pillar 2)
- Policy gates (Whitepaper §7)
- Ledger append/replay/branch contracts (Whitepaper §5 Pillar 4)
- Routing contracts (Whitepaper §5 Pillar 3)

## Consequences

### Positive

- Single source of truth for all type definitions
- Zod schemas provide runtime validation
- Clear separation between contracts and implementations
- Patent claim surfaces are traceable to code

### Negative

- Requires discipline to not bypass `@mss/core`
- Schema changes require coordination across packages
- Initial setup is more work than ad-hoc coding

## Anti-Pattern Warning

**Do not:**
- Add new event types in implementation packages
- Define resource schemas outside `@mss/core`
- Create "just this one helper type" in implementation code

**Do:**
- Propose changes to `@mss/core` contracts via PR
- Reference whitepaper sections in contract comments
- Use Zod for runtime validation at package boundaries
