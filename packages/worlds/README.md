# @mss/worlds — World Runtime Manager

**Whitepaper mapping:** §4.2.6 World Runtime Manager + §5 Pillar 4 + Innovation #3

## Architecture

`@mss/worlds` manages event-sourced world state, entity lifecycles, and branching timeline histories for autonomous multi-agent simulation environments.

### WorldState

`WorldState` provides deterministic entity state management backed by an append-only event log.

- **Entity Management**: Lifecycle operations (`createEntity`, `updateEntity`, `deleteEntity`, `getEntity`, `listEntities`) for simulated actors, items, and environments. State transitions require stable unique event IDs (`event.id`), with mutation-bypass protection via defensive deep cloning on `getEntity()` and `listEntities()` so external callers cannot mutate internal state directly.
- **Event-Driven Transitions**: State transitions are applied via `applyEvent()` and recorded in an immutable event log (`logEvent()`). Every mutation strictly routes through events, rejecting duplicate event IDs to guarantee event log integrity.
- **Replay & Rehydration**: `replayEvents()` returns an immutable deep clone of the recorded event log, while `rehydrate(events)` deterministically reconstructs entity and custom state from raw event history. Rehydration is atomic and failure-safe: prevalidates all event IDs in a temporary pass and only commits state references once all events succeed, leaving pre-existing state 100% untouched on failure.
- **Snapshot & Restore**: Captures complete world state with `snapshot()`, returning a typed `WorldSnapshot` (`{ worldId, entities, eventCount, events, customState }`). `restore(snapshot)` validates `worldId` and `eventCount` consistency and reconstructs state 100% from `snapshot.events` via `rehydrate()` (never blindly trusting external entity or state overlays).

### TimelineManager

`TimelineManager` handles branching and merging execution paths across worlds.

- **Branching & Ancestry**: Supports forkable timelines (`createTimeline`, `forkTimeline`) with lineage tracking (`forkFromTimelineId`, `forkPoint`).
- **Validation**: Enforces strict index boundaries on timeline branching (`atEventIndex >= 0 && atEventIndex <= original.events.length`), direct-create validation (parent timeline existence, world isolation, and forkPoint bounds), and rejects duplicate event IDs during `appendEvent()`.
- **World Isolation**: Enforces world boundaries, preventing cross-world timeline merges (`source.worldId === target.worldId`) and parent creation across worlds.
- **Ancestry-Safe Merge & Divergent Event Integration**: Merges divergent branches (`mergeTimeline`) by walking parent chains to resolve the Lowest Common Ancestor (LCA). Deduplication is performed strictly by stable `event.id`, preserving legitimate repeated actions (e.g. repeated moves or attacks) while preventing duplicate events. Rejects self-merges and unrelated roots with no common ancestry.
- **Head Management & Migration**: Tracks the active timeline head per world (`getHead`, `isHead`). On merge, atomically migrates the active world head to the target timeline (`source.isHead = false`, `target.isHead = true`).

## Contracts Used

Integrated with `@mss/core` protocol definitions:

- `@mss/core/events` — `WorldEventAppended`, `TimelineForked`
- `@mss/core/resources` — `WorldStateResource`, `WorldEventRecord`, `EntityRef`
- `@mss/core/contracts` — `EventLedger`, `AppendResult`, `ReplayCursor`, `ForkParams`, `ForkResult`

`@mss/worlds` re-exports these protocol types from `@mss/core` as external type contracts, while providing its own standalone in-memory event-driven `WorldState` and `TimelineManager` runtime implementations.
