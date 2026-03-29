# Founder Command Center v1.2

## Status: STAGING OPERATIONAL

The staging-capable governed execution system with durable persistence, approval UI flow, and external brief delivery.

## What This Is

A governed execution infrastructure that converts signals into prioritized actions with approval gates, receipts, and daily briefs — **controlled by explicit policy files** and **backed by D1-compatible storage**.

**The Loop**:
```
Signal → Decision → Approval → Action → Receipt → Brief → Delivery
```

## Version History

| Version | Status | Description |
|---------|--------|-------------|
| v1.0 | OPERATIONAL | Closed loop with receipts |
| v1.1 | POLICY-GOVERNED | Behavior controlled by policy files |
| v1.2 | STAGING OPERATIONAL | D1 schema, storage adapters, brief delivery |

## Architecture

### Core Components

| Component | Purpose | Location |
|-----------|---------|----------|
| **Signal Ingestor** | Receives signals from sources | `signals/` |
| **Policy Engine** | Applies policies to decisions | `engine.ts` |
| **Decision Maker** | Classifies and routes | `core.ts` |
| **Approval Gate** | Manages approval workflow | `approvals/` |
| **Action Executor** | Executes or blocks actions | `actions/` |
| **Receipt Ledger** | Auditable proof trail | `receipts/` |
| **Brief Generator** | Daily operational brief | `briefs/` |
| **Delivery Layer** | External channel delivery | `delivery/` |

### Storage Layer (v1.2)

| Adapter | Purpose | Location |
|---------|---------|----------|
| **StorageAdapter Interface** | Interchangeable backend contract | `storage/storage-adapter.ts` |
| **FileStorageAdapter** | Local dev, rollback, testing | `storage/file-storage-adapter.ts` |
| **D1StorageAdapter** | Staging/production persistence | `storage/d1-storage-adapter.ts` |

### D1 Schema (v1.0.0)

| Table | Purpose |
|-------|---------|
| `signals` | Normalized input signals |
| `decisions` | Classification and routing outcomes |
| `approvals` | Approval requests and resolutions |
| `actions` | Executable or blocked actions |
| `receipts` | Immutable audit trail |
| `briefs` | Generated daily briefs |
| `brief_deliveries` | External delivery tracking |
| `dead_letters` | Failed actions |

### Brief Delivery Layer (v1.2)

| Adapter | Channel | Purpose |
|---------|---------|---------|
| **TelegramBriefDeliveryAdapter** | Telegram | Immediate mobile delivery |
| **EmailBriefDeliveryAdapter** | Email | Portable archival delivery |

### Migrations

| Migration | Tables/Indexes |
|-----------|----------------|
| `0001_init_founder_command_center.sql` | 8 tables |
| `0002_indexes.sql` | 13 indexes |

### Policy Layer

| Policy File | Controls |
|-------------|----------|
| `approval_policies.json` | When approvals are required, auto-deny/escalate rules |
| `routing_policies.json` | Priority assignment by signal type/source |
| `confidence_policies.json` | Thresholds for auto-execute, escalate, block |
| `briefing_policies.json` | Daily brief content and formatting |

### Schemas

All artifacts use canonical schemas (v1.1.0):
- `schemas/schemas.ts` — TypeScript interfaces
- Every receipt includes `schema_version` and `policy_version`

## Policy-Driven Behavior Examples

### APR-001: Critical Priority Block
```
Signal: email.urgent (critical)
Confidence: 95%
Policy: APR-001 (critical-priority-block)
Result: BLOCKED despite high confidence
```

### APR-004: Low Confidence Escalate
```
Signal: email.received
Confidence: 45%
Policy: APR-004 (low-confidence-auto-escalate)
Result: ESCALATED to human-review-queue
```

### APR-005: Safe Auto-Execute
```
Signal: task.created
Confidence: 92%
Priority: medium, Risk: low
Policy: APR-005 (auto-execute-safe)
Result: EXECUTED without approval
```

## Receipt Schema (v1.1.0)

```json
{
  "id": "rcpt_2026_03_29_545",
  "schema_version": "1.1.0",
  "timestamp": "2026-03-29T10:21:37Z",
  "type": "action.succeeded",
  "status": "success",
  "confidence": 0.85,
  "signal_id": "sig_...",
  "decision_id": "dec_...",
  "approval_id": "appr_...",
  "action_id": "act_...",
  "policy_version": "2026-03-29.1",
  "actor": "founder-command-center",
  "result_ref": "actions.jsonl#act_...",
  "duration_ms": 12
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
# v1.0/v1.1 Demo (policy-controlled)
cd /home/workspace/mcp-super-server/founder-command-center
bun run demo_policy.ts

# v1.2 Staging Demo (D1-compatible storage + delivery)
bun run demo_staging.ts
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
| PROOF 5: POLICY-CONTROLLED | ✓ | Policy files control behavior |
| PROOF 6: STAGING OPERABILITY | ✓ | D1 schema, storage adapters, brief delivery |

## Staging Demo Results (v1.2)

```
Schema Version: 1.0.0
Policy Version: 2026-03-29.1

▶ Signal Ingestion: 3 signals (critical, medium, low)
▶ Decision & Policy: 1 requires approval, 2 auto-execute
▶ Approval Flow: 1 pending → resolved
▶ Action Execution: 2 succeeded, 1 blocked
▶ Brief Generation: Daily brief created
▶ Brief Delivery: Email sent

Verification:
  ✓ 100% signal persistence
  ✓ 100% receipt persistence
  ✓ Brief delivered: YES
```

## Status Language

> We now have the initial control primitives for a founder-facing command system: signal intake, prioritization, approval gating, health vigilance, and voice command routing. The next milestone is governed end-to-end execution with auditable receipts.

---

*Generated: 2026-03-29*