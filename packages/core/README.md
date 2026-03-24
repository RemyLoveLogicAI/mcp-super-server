# @mss/core — Contracts

> If it's not here, it's not real.

This package contains all canonical types, events, resources, policies, and contracts for the MCP Super-Server.

## Whitepaper Mapping

| Module | Whitepaper Section | Description |
|--------|-------------------|-------------|
| `events/` | §12 Appendix A | Core event types |
| `resources/` | §4.2 + §5 | Protocol resource schemas |
| `policies/` | §7 | Security model + policy gates |
| `contracts/` | §5 Pillars | Implementation interfaces |

## Usage

```typescript
import { 
  CoreEvent,
  VoiceSessionStateResource,
  ToolCallRequest,
  EventLedger 
} from '@mss/core';
```

## Anti-Drift Rule

- **NO** new event types may be defined outside this package
- **NO** new resource schemas may be defined outside this package
- **NO** contract interfaces may be extended without updating this package first

All implementations MUST conform to contracts defined here.

## Event Types (§12)

- `VoiceTurnStarted` / `VoiceTurnFinalized`
- `ToolCallRequested` / `ToolCallCompleted` / `ToolCallCanceled`
- `WorldEventAppended` / `TimelineForked`
- `IdentityLinked` / `IdentityUnlinked`

## Resource Schemas (§4.2 + §5)

- `VoiceSessionStateResource` — Voice transport state
- `WorldStateResource` — Event-sourced world state
- `CanonicalIdentityResource` — Cross-platform identity
- `ToolDescriptor` — Tool capability registry

## Contracts (§5)

- `ToolInvoker` — Tool execution interface
- `EventLedger` — Append-only event store
- `MeshRouter` — Capability routing
