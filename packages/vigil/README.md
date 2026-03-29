# @mss/vigil — VIGIL Self-Healing Layer

Autonomous self-repair system for the MCP Super-Server. Monitors health, detects errors, diagnoses root causes, executes repairs, and verifies fixes — all without human intervention.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         VIGIL                                    │
│                                                                  │
│  ┌──────────┐   ┌──────────┐   ┌────────────┐   ┌───────────┐  │
│  │ Monitor  │──▶│ Detector │──▶│ Diagnosis  │──▶│  Executor │  │
│  └──────────┘   └──────────┘   └────────────┘   └───────────┘  │
│       │                                                │        │
│       │         ┌──────────────────┐                  │        │
│       └────────▶│ Verification Loop │◀─────────────────┘        │
│                 └──────────────────┘                           │
│                        │                                         │
│                        ▼                                         │
│                 ┌─────────────┐                                  │
│                 │ Escalation  │                                  │
│                 └─────────────┘                                  │
│                        │                                         │
│                        ▼                                         │
│                 ┌─────────────┐                                  │
│                 │ Meta-Prompt │                                  │
│                 └─────────────┘                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### Health Monitor (`monitor.ts`)
- Polls all subsystems: `server`, `voice_session`, `ledger`, `tool_registry`, `orchestrator`, `identity`
- Sliding window health history (default: 10 entries)
- Emits `VigilHealthCheck` events to ledger
- Configurable polling interval (default: 30s)

### Error Detection (`detector.ts`)
- Pattern matching against 12 built-in error signatures (timeout, OOM, connection refused, etc.)
- Error classification: severity × persistence × recoverability
- Aggregation and deduplication of repeated errors
- Custom patterns can be added at runtime

### Diagnosis Engine (`diagnosis.ts`)
- Maps errors → root causes → solutions via knowledge base
- Confidence scoring (0.3–0.95) based on pattern match and error frequency
- Solution ranking by `impact_score × reversibility`
- Chain-of-thought reasoning stored in ledger

### Auto-Repair Executor (`executor.ts`)
- Rate limiting: max 5 repairs/minute, 20 repairs/hour
- Built-in action handlers: `restart_service`, `clear_cache`, `reset_session`, etc.
- Rollback capability for failed repairs
- All actions logged to ledger

### Verification Loop (`verify.ts`)
- Confirms fix by re-checking subsystem health
- Retries with alternative solutions if verification fails
- Max 3 attempts before escalation

### Escalation Handler (`escalate.ts`)
- Human approval when confidence < 0.7 or max attempts exceeded
- SMS notification via `send_sms_to_user`
- Approval gate integration (optional HTTP endpoint)
- 5-minute response timeout (configurable)

### Meta-Prompting Engine (`meta.ts`)
- Generates fix strategies dynamically using chain-of-thought
- Self-consistency: generates 3 candidates, picks best by action frequency
- Fallback inference when no knowledge base entry exists

## Usage

```typescript
import { createVigil } from "@mss/vigil";

// Create VIGIL with ledger integration
const vigil = createVigil({
  auto_repair_enabled: true,
  max_repairs_per_minute: 5,
  ledger: ledgerInstance,
  escalation: {
    min_confidence_threshold: 0.7,
    notify_sms: true,
  },
});

// Bind to MCP server
vigil.bindServer(server);

// Start monitoring
vigil.start();

// Manually process an error
const result = await vigil.processError(
  ["Connection refused to service"],
  "server",
  { ip: "192.168.1.1" }
);

console.log(result);
// {
//   detected: [{ id, pattern_id: "connection_refused", ... }],
//   diagnosis: { id, confidence: 0.75, solutions: [...], ... },
//   repair: { repair_id, success: true, ... },
//   verification: { verified: true, escalated: false }
// }
```

## Error Patterns (Built-in)

| Pattern ID | Description | Classification |
|-----------|-------------|----------------|
| `timeout_error` | Network/service timeout | High, Transient |
| `connection_refused` | Connection refused | Critical, Persistent |
| `memory_exhausted` | OOM/heap exhaustion | Critical, Persistent |
| `invalid_state` | FSM state error | High, Persistent |
| `ledger_write_failure` | Ledger write failed | Critical, Persistent |
| `tool_not_found` | Tool unavailable | Medium, Transient |
| `gate_denial` | Permission denied | Medium, Transient |
| `voice_fsm_error` | Voice subsystem error | High, Transient |
| `session_expired` | Session/TTL expired | Medium, Transient |
| `rate_limit_exceeded` | Rate limit hit | Medium, Transient |
| `orchestrator_failure` | Orchestrator error | High, Persistent |
| `validation_error` | Input validation failed | Medium, Persistent |

## VIGIL Events (to Ledger)

All events emitted to the ledger for auditability:

- `VigilHealthCheck` — Periodic health check result
- `VigilErrorDetected` — New error pattern matched
- `VigilDiagnosisComplete` — Diagnosis finished
- `VigilRepairStarted` — Repair action sequence began
- `VigilRepairCompleted` — Repair succeeded
- `VigilRepairFailed` — Repair failed (after all attempts)
- `VigilEscalationCreated` — Human escalation created
- `VigilEscalationApproved` — Human approved escalation
- `VigilEscalationRejected` — Human rejected escalation

## Target

**90%+ error resolution without human intervention.**
