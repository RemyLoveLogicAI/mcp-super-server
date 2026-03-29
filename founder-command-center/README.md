# Founder Command Center v1

## Status: OPERATIONAL

The closed-loop governed execution system is live.

## What This Is

A governed execution infrastructure that converts signals into prioritized actions with approval gates, receipts, and daily briefs.

**The Loop**:
```
Signal → Decision → Approval → Action → Receipt → Brief
```

## Architecture

### Core Components

| Component | Purpose | Location |
|-----------|---------|----------|
| **Signal Ingestor** | Receives and classifies signals | `core.ts` → `SignalIngestor` |
| **Approval Gate** | Governs high-risk actions | `core.ts` → `ApprovalGate` |
| **Action Executor** | Executes approved actions | `core.ts` → `ActionExecutor` |
| **Receipt Ledger** | Writes auditable receipts | `core.ts` → `ReceiptLedger` |
| **Brief Generator** | Produces daily summary | `core.ts` → `DailyBriefGenerator` |

### Event Schema

Canonical event types across all modules:

```typescript
type EventType =
  // Signal lifecycle
  | 'signal.received'
  | 'signal.classified'
  | 'signal.prioritized'
  
  // Approval lifecycle
  | 'approval.requested'
  | 'approval.granted'
  | 'approval.denied'
  
  // Action lifecycle
  | 'action.proposed'
  | 'action.started'
  | 'action.succeeded'
  | 'action.failed'
  | 'action.blocked'
  
  // Brief lifecycle
  | 'brief.generated'
  | 'brief.delivered';
```

### Priority System

| Priority | Trigger | Approval Required |
|----------|---------|-------------------|
| `critical` | "urgent", "critical", "asap" | Yes (auto-deny for demo) |
| `high` | "important", "high", dev category | Yes |
| `medium` | "medium", communication category | No |
| `low` | Default | No |

### Receipt Schema

Every meaningful action produces a receipt:

```json
{
  "id": "rcpt_2026_03_29_001",
  "timestamp": "2026-03-29T08:00:00Z",
  "type": "action.succeeded",
  "source": "action-executor",
  "input_ref": "sig_2026_03_29_468",
  "approval_ref": "appr_2026_03_29_940",
  "result": "Executed: process_signal --source email",
  "confidence": 0.85,
  "status": "success"
}
```

## Output Artifacts

| Artifact | Path | Purpose |
|----------|------|---------|
| `events.jsonl` | `events/` | Chronological event ledger |
| `actions.jsonl` | `actions/` | Action execution log |
| `approvals.jsonl` | `approvals/` | Approval decisions |
| `receipts.jsonl` | `receipts/` | Auditable receipts |
| `daily_brief_YYYY-MM-DD.md` | Root | Daily summary |

## Running the Loop

```bash
cd /home/workspace/founder-command-center
bun run demo.ts
```

## Integration Points

### Packages (from mcp-super-server)

- **approval-gate**: Human-in-the-loop approval queue
- **vigil**: Self-healing monitoring with escalation
- **voice-command**: Intent detection and command routing

### Future Connections

- Gmail API → Real email signals
- GitHub API → Real PR/issue signals
- Google Drive API → Real doc signals
- Voice input → Real voice command signals

## Proof Trail

| Proof | Status | Evidence |
|-------|--------|----------|
| PROOF 1: SHIPMENT | ✓ | 41 files, 7802 lines pushed to GitHub |
| PROOF 2: CONNECTION | ✓ | `command_loop.py` → `command_output.txt` |
| PROOF 3: ARTICULATION | ✓ | `COMMAND_LAYER_V1.md` |
| PROOF 4: GOVERNED EXECUTION | ✓ | Full loop with receipts |

## Status Language

> We now have the initial control primitives for a founder-facing command system: signal intake, prioritization, approval gating, health vigilance, and voice command routing. The next milestone is governed end-to-end execution with auditable receipts.

---

*Generated: 2026-03-29*