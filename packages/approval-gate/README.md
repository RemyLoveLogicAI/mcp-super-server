# @mss/approval-gate

Human-in-loop approval system for MCP Super-Server.

## Overview

This package implements a non-intrusive approval gate system that:
- Queues approval requests with priority by risk level
- Auto-expires pending requests with configurable behavior
- Auto-approves reversible actions on timeout
- Only blocks truly irreversible external actions
- Maintains full audit trail via ledger integration
- Sends SMS notifications for pending approvals

## Quick Start

```typescript
import {
  ApprovalQueue,
  ApprovalNotifier,
  createApprovalGate,
  createApprovalRoutes,
} from "@mss/approval-gate";

// Create queue and notifier
const queue = new ApprovalQueue();
const notifier = new ApprovalNotifier({
  minRiskLevel: "medium",
  deepLinkBase: "https://remysr.zo.space/approval-gate",
});

// Create approval gate for PolicyToolGate integration
const approvalGate = createApprovalGate({
  queue,
  notifier,
  riskLevelMap: {
    read_only: "low",
    reversible_write: "low",
    irreversible_write: "high",
  },
});

// Create API routes
const routes = createApprovalRoutes(queue, notifier);
```

## Risk Levels

| Level | Default Timeout | Auto-Approve on Timeout |
|-------|-----------------|------------------------|
| low | 5 min | Yes |
| medium | 3 min | Yes |
| high | 1 min | No |
| critical | 30 sec | No |

## Policy Integration

The approval gate integrates with `PolicyToolGate` from `@mss/tools`:

```typescript
import { PolicyToolGate } from "@mss/tools";
import { createApprovalGate } from "@mss/approval-gate";

const policyGate = new PolicyToolGate({
  customGates: [approvalGate],
});
```

## Audit Trail

All approval decisions are logged to the ledger for compliance:

```typescript
import { createInMemoryLedger } from "@mss/ledger";

const ledger = createInMemoryLedger();
const queue = new ApprovalQueue({
  ledger: {
    append: async (entry) => {
      await ledger.append({
        type: "approval_audit",
        payload: entry,
      });
    },
  },
});
```

## Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | /approval-requests | Create new request |
| GET | /approval-requests/pending | List pending requests |
| GET | /approval-requests/:id | Get request details |
| POST | /approval-requests/:id/approve | Approve request |
| POST | /approval-requests/:id/deny | Deny request |
| GET | /approval-requests/:id/status | Check request status |

## Key Principles

- **Non-intrusive**: Async notifications, mobile-friendly UI
- **Default approve**: Reversible actions auto-approve on timeout
- **Only block**: Truly irreversible external actions (email, publish, financial)
- **Audit trail**: All decisions logged to ledger
