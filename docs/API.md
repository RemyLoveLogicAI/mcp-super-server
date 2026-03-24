# MCP Super-Server API Reference

**Version:** 0.0.1 (Contract-First)  
**Whitepaper:** `docs/whitepaper.md`

---

## Core Concepts

### Events

All state changes in the system are represented as immutable events in the Event Ledger.

| Event Type | Description |
|------------|-------------|
| `VoiceTurnStarted` | User began speaking |
| `VoiceTurnFinalized` | ASR transcription complete |
| `ToolCallRequested` | Agent invoked a tool |
| `ToolCallCompleted` | Tool execution finished |
| `ToolCallCanceled` | Tool was cancelled (barge-in) |
| `IdentityLinked` | Platform identity linked to canonical user |
| `IdentityUnlinked` | Platform identity unlinked |

### Session States

Voice sessions follow an FSM with these states:

```
idle → listening → processing → speaking
              ↑         ↓
              └── barge-in ←┘
```

| State | Description |
|-------|-------------|
| `idle` | No active session |
| `listening` | Capturing audio |
| `processing` | Analyzing transcription |
| `speaking` | TTS output playing |
| `interrupted` | Barge-in occurred |

---

## MCPSuperServer Class

### Constructor

```typescript
const server = new MCPSuperServer({
  gateMode: 'write_approval',  // 'permissive' | 'read_only' | 'write_approval'
  maxCallsPerSession: 10,
  maxCostPerSession: 1000,
  agentId: 'default-agent',
});
```

### Session Management

#### `createSession(canonicalUserId, channel)`

Create a new voice session.

```typescript
const sessionId = await server.createSession(
  'user-123',
  'discord'  // 'discord' | 'telegram' | 'whatsapp' | 'r1' | 'web' | 'mobile'
);
```

#### `getSession(sessionId)`

Retrieve an existing session.

```typescript
const session = server.getSession(sessionId);
const state = session.getState();  // 'idle' | 'listening' | 'processing' | 'speaking' | 'interrupted'
```

---

### Voice Turn Processing

#### `onAudioStart(sessionId)`

Signal that user started speaking.

```typescript
await server.onAudioStart(sessionId);
```

#### `onASRFinal(sessionId, text)`

Feed final ASR transcription to the session.

```typescript
await server.onASRFinal(sessionId, 'What is the weather in San Francisco?');
```

#### `onAudioEnd(sessionId)`

Signal that audio capture ended.

```typescript
await server.onAudioEnd(sessionId);
```

#### `onBargeIn(sessionId)`

Signal a user interrupt (barge-in). Cancels any pending TTS and tool calls.

```typescript
await server.onBargeIn(sessionId);
```

---

### Tool Invocation

#### `invokeTool(sessionId, toolId, input)`

Evaluate and execute a tool call through the policy gate.

```typescript
const result = await server.invokeTool(
  sessionId,
  'web:fetch',
  { url: 'https://api.weather.com/forecast?city=San+Francisco' }
);

// Result:
{
  decision: 'allow' | 'deny' | 'require_human',
  result?: unknown,  // Tool output if allowed
}
```

**Policy Gate Behavior:**

| Gate Mode | Read-Only Tools | Write Tools |
|-----------|------------------|-------------|
| `permissive` | ✅ Allow | ✅ Allow |
| `read_only` | ✅ Allow | ❌ Deny |
| `write_approval` | ✅ Allow | ⏳ Require Human |

---

### Identity Operations

#### `linkIdentity(platform, platformIdentityId, canonicalUserId?)`

Link a platform-specific identity to a canonical user.

```typescript
// Auto-create new canonical identity
const { canonicalUserId, isNew } = await server.linkIdentity(
  'discord',
  'discord-user-12345'
);

// Link to existing identity
await server.linkIdentity(
  'telegram',
  'telegram-user-67890',
  canonicalUserId  // Existing canonical user
);
```

---

### Event Replay

#### `replaySession(sessionId)`

Retrieve all events for a session.

```typescript
const events = await server.replaySession(sessionId);
for (const event of events) {
  console.log(event.event_type, event);
}
```

#### `verifyIntegrity(worldId, timelineId)`

Verify the hash chain integrity of a timeline.

```typescript
const { valid } = await server.verifyIntegrity(worldId, timelineId);
console.log('Integrity valid:', valid);
```

---

## Orchestrator

### Creating Plans

```typescript
const plan = server.createPlan({
  goal: 'Get weather and format for user',
  requestedTools: ['web:fetch', 'format:weather'],
});

// Plan structure:
{
  plan_id: string,
  agent_id: string,
  goal: string,
  steps: [
    {
      step_id: string,
      tool_id: string,
      input: Record<string, unknown>,
      depends_on?: string[],
      continue_on_failure?: boolean,
      status: 'pending' | 'executing' | 'completed' | 'failed' | 'skipped',
    }
  ],
  budget: { max_tool_calls: number },
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled',
}
```

### Executing Plans

```typescript
const result = await server.executePlan(plan.plan_id, {
  onStepComplete: (step) => {
    console.log(`Step ${step.step_id} ${step.status}`);
  },
});
```

---

## CLI Usage

```bash
# Run the CLI demo
pnpm --filter @mss/server dev

# Output:
# Created session: <uuid>
# Audio started
# ASR finalized
# Audio ended
# Tool result: { decision: 'deny' }
# Identity: { canonicalUserId: <uuid>, isNew: true }
# Session had 1 events
```

---

## Package Exports

### `@mss/core`
- `CoreEvent` — Union of all event types
- `EventLedger` — Ledger interface
- `ToolGateDecision` — Gate decision types
- `VoiceSessionStateResource` — Session state type

### `@mss/voice`
- `VoiceSessionFSM` — Voice session state machine
- `VoiceEffectExecutor` — Effect handler
- `createVoiceSession()` — Factory function

### `@mss/tools`
- `PolicyToolGate` — Policy enforcement
- `createPermissiveGate()` — Allow all
- `createReadOnlyGate()` — Deny writes
- `createWriteApprovalGate()` — Require approval for writes

### `@mss/ledger`
- `InMemoryLedger` — Dev/test implementation
- `SupabaseLedger` — Production Postgres implementation

### `@mss/identity`
- `IdentityResolver` — Identity linking
- `createIdentityResolver()` — Factory function

### `@mss/orchestrator`
- `AgentOrchestrator` — Multi-step plan executor
- `createOrchestrator()` — Factory function

---

## Error Handling

All async methods throw on failure:

```typescript
try {
  await server.onAudioStart(sessionId);
} catch (error) {
  if (error.message.includes('Session not found')) {
    // Handle missing session
  }
}
```

---

## Whitepaper References

- **§4.2.2** — Voice Transport Layer
- **§4.2.5** — Tool Manager
- **§4.2.7** — Identity Mesh
- **§4.2.8** — Event Ledger
- **§5 Pillar 1** — Voice → Agent Pipeline
- **§5 Pillar 2** — Autonomous Agents & Tools
- **§7.4** — Human-in-the-loop Gates
