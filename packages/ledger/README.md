# @mss/ledger — Event Ledger

**Whitepaper mapping:** §4.2.8 Event Ledger

## Responsibilities

- Append-only event storage
- Replay for state derivation
- Timeline branching (fork/merge)
- Integrity verification (hash chain)
- Audit export

## Core Contract

Implements `EventLedger` interface from `@mss/core/contracts`:

```typescript
interface EventLedger {
  append(event: CoreEvent): Promise<AppendResult>;
  replay(cursor: ReplayCursor): AsyncIterable<ReplayedEvent>;
  fork(params: ForkParams): Promise<ForkResult>;
}
```

## Event Sourcing Guarantee

- Events are **immutable** once appended
- State is **derived** by replaying events
- Hash chain provides **integrity verification**
- Branching creates **independent timelines**

## Storage Backend

Default implementation uses Supabase/Postgres.
Interface allows alternative backends (Redis Streams, Kafka, etc.)

## Anti-Drift Rule

Event schemas are defined in `@mss/core/events`.
The ledger stores and retrieves; it does not define event structure.
