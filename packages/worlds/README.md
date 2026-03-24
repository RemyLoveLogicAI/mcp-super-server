# @mss/worlds — World Runtime Manager

**Whitepaper mapping:** §4.2.6 World Runtime Manager + §5 Pillar 4 + Innovation #3

## Responsibilities

- Interactive narrative runtime (Ink/Glulx integration)
- Rules engine hooks
- Entity simulation (NPCs/items/locations)
- Event-sourced state management
- Branching timeline support

## Patent Surface

**Innovation #3: Agentic Game State Orchestrator**

World state is:
- Exposed as MCP resources
- Mutated only via event-sourced tool calls
- Coordinated by multiple agents (NPC swarms + system agents)
- Enforced through policy gates and capability scopes

Key differentiator: World logic is not monolithic. It is multi-agent orchestrated with deterministic event logs.

## Contracts Used

- `@mss/core/events` — `WorldEventAppended`, `TimelineForked`
- `@mss/core/resources` — `WorldStateResource`, `WorldEventRecord`, `EntityRef`
- `@mss/core/contracts` — `EventLedger` for event sourcing

## Event Sourcing Requirement

Every state transition MUST be an event:
```
EVENT(type, timestamp, actor, payload, prev_hash, hash)
```

State is derived by replaying events, never by direct mutation.
