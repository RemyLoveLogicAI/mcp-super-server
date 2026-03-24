# MCP Super-Server API Documentation

## Architecture Overview

The MCP Super-Server implements a **contract-first monorepo** with 13 packages aligned to the whitepaper architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Super-Server                         │
├─────────────────────────────────────────────────────────────┤
│  @mss/core        — Contracts, Events, Policies            │
│  @mss/voice      — Voice FSM + Interrupt Semantics         │
│  @mss/tools      — Tool Gate Policy Enforcement            │
│  @mss/ledger     — Event Store (InMemory + Supabase)      │
│  @mss/identity   — Cross-Platform Identity Mesh            │
│  @mss/orchestrator — Agent Planning + Execution             │
│  @mss/context-fabric — Multimodal Context                   │
└─────────────────────────────────────────────────────────────┘
```

## Core Classes

### MCPSuperServer

Main server class composing all components.

```typescript
import { createMCPServer } from "@mss/server";

const server = createMCPServer({
  gateMode: "write_approval", // "permissive" | "read_only" | "write_approval"
  maxCallsPerSession: 10,
  agentId: "agent-001"
});
```

#### Session Management

```typescript
// Create a voice session
const sessionId = await server.createSession("user-123", "telegram");

// Retrieve session
const session = server.getSession(sessionId);
```

#### Voice Turn Processing

```typescript
// User starts speaking
await server.onAudioStart(sessionId);

// ASR returns final transcription
await server.onASRFinal(sessionId, "What's the weather?");

// User stops speaking
await server.onAudioEnd(sessionId);

// User interrupts (barge-in)
await server.onBargeIn(sessionId);
```

#### Tool Invocation

```typescript
// Register a tool
server.registerTool({
  tool_id: "weather:current",
  name: "Get Current Weather",
  side_effect_class: "read_only", // "read_only" | "reversible_write" | "irreversible_write"
  capabilities: ["weather", "location-based"],
  available: true
});

// Invoke tool
const result = await server.invokeTool(sessionId, "weather:current", {
  location: "San Francisco"
});

if (result.decision === "allow") {
  console.log("Result:", result.result);
} else if (result.decision === "require_human") {
  console.log("Needs approval");
} else {
  console.log("Denied");
}
```

#### Execution Plans

```typescript
// Create execution plan
const plan = await server.createExecutionPlan(
  sessionId,
  "Check weather and suggest clothing",
  ["weather:current", "recommend:outfit"]
);

// Execute plan
const executedPlan = await server.executePlan(plan);
console.log(executedPlan.status); // "completed" | "failed"
```

#### Event Replay

```typescript
// Replay all events for a session
const events = await server.replaySession(sessionId);
for (const event of events) {
  console.log(event.event_type, event.timestamp);
}
```

#### Identity Linking

```typescript
// Link platform identity to canonical user
const { canonicalUserId, isNew } = await server.linkIdentity(
  "telegram",
  "user-12345",
  "canonical-user-abc" // optional existing canonical ID
);
```

### VoiceSessionFSM

Voice session state machine with interrupt semantics.

```typescript
import { createVoiceSession } from "@mss/voice";

const fsm = createVoiceSession("user-123", "telegram");

// State transitions
const r1 = fsm.transition({ type: "AUDIO_START" });
// idle → listening

const r2 = fsm.transition({ type: "ASR_FINAL", text: "Hello" });
// listening → processing

const r3 = fsm.transition({ type: "TTS_START" });
// processing → speaking

// Barge-in cancels TTS and pending tools
const r4 = fsm.transition({ type: "AUDIO_START" });
// speaking → interrupted → listening
```

**States:** `idle` | `listening` | `processing` | `speaking` | `interrupted`

**Effects:** `emit_turn_started`, `emit_turn_finalized`, `emit_tool_canceled`, `cancel_tts`, `cancel_pending_tools`

### PolicyToolGate

Tool invocation policy enforcement with DENY-by-default.

```typescript
import { createPermissiveGate, createReadOnlyGate, createWriteApprovalGate } from "@mss/tools";

// Permissive mode (development only)
const gate = createPermissiveGate();

// Read-only mode (blocks all writes)
const gate = createReadOnlyGate();

// Write approval (requires human for irreversible writes)
const gate = createWriteApprovalGate();

// Evaluate tool invocation
const decision = await gate.evaluate({
  session_id: "session-123",
  tool_id: "db:write",
  purpose: "Update user preferences",
  requested_effect: { sideEffect: "reversible_write", approval: "auto" }
});
```

### EventLedger

Append-only event store with hash chain integrity.

```typescript
import { createInMemoryLedger } from "@mss/ledger";

const ledger = createInMemoryLedger();

// Append event
const result = await ledger.append({
  event_type: "VoiceTurnFinalized",
  session_id: "session-123",
  turn_id: 1,
  asr_final: "Hello world"
});

// Replay events
for await (const event of ledger.replay({ from_index: 0 })) {
  console.log(event.index, event.event.event_type);
}

// Verify integrity
const integrity = await ledger.verifyIntegrity("world-1", "timeline-1");
console.log(integrity.valid);
```

## Policy Model

### Side Effect Classification

| Class | Description | Default Policy |
|-------|-------------|---------------|
| `read_only` | No state mutation | Auto-allow |
| `reversible_write` | Can be undone | Auto-allow |
| `irreversible_write` | Cannot be undone | Require human |

### Trust Tiers

| Tier | Description |
|------|-------------|
| `untrusted` | Client devices, external platforms |
| `semi_trusted` | Gateway layer |
| `trusted` | Core server components |

## Event Types

Core events (Whitepaper §12):

- `VoiceTurnStarted` — New voice turn begins
- `VoiceTurnFinalized` — Voice turn completes with transcription
- `ToolCallRequested` — Tool invocation requested
- `ToolCallCompleted` — Tool invocation finished
- `ToolCallCanceled` — Tool invocation canceled (barge-in)
- `WorldEventAppended` — World state changed
- `IdentityLinked` — Platform identity linked to canonical user
- `IdentityUnlinked` — Platform identity unlinked
- `TimelineForked` — Timeline branched

## Testing

```bash
# Run all tests
pnpm test

# Run specific package
pnpm --filter @mss/voice test
pnpm --filter @mss/tools test
pnpm --filter @mss/server test
```

## Build

```bash
# Build all packages
pnpm build

# Typecheck
pnpm typecheck

# Dev mode
pnpm --filter @mss/server dev
```
