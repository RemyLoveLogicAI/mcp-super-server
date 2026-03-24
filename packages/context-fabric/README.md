# @mss/context-fabric — Context Fabric

**Whitepaper mapping:** §4.2.3 Context Fabric + Innovation #1

## Responsibilities

- Ingest multimodal streams (voice, chat, events, tools, world)
- Normalize into versioned context objects
- Maintain bidirectional links between:
  - Identity mesh nodes
  - World state references
  - Tool capability scopes
  - Memory embeddings
  - Session turn events
- Query + streaming to agents in real time

## Patent Surface

**Innovation #1: Multimodal Agent Context Fabric**

Key differentiator: Context is not per-agent. It is:
- Platform-level
- Policy-scoped
- Event-sourced
- Replayable

## Contracts Used

- `@mss/core/events` — All event types feed into context
- `@mss/core/resources` — Links to all resource types
- `@mss/core/policies` — Policy-scoped context slices

## Anti-Drift Rule

Context normalization schemas must be defined in `@mss/core`.
This package implements the substrate, not the schema.
