/**
 * Founder Command Center v1.1 — Canonical Schemas
 * 
 * Formal contracts for governed execution.
 * Schema version: 1.1.0
 */

// ============================================================================
// SIGNAL
// ============================================================================

export interface Signal {
  /** Unique signal identifier */
  id: string;
  
  /** Schema version */
  schema_version: "1.1.0";
  
  /** ISO 8601 timestamp */
  timestamp: string;
  
  /** Signal type classification */
  type: SignalType;
  
  /** Source system */
  source: SignalSource;
  
  /** Raw payload */
  payload: Record<string, unknown>;
  
  /** Signal metadata */
  metadata: SignalMetadata;
}

export type SignalType =
  | 'email.received'
  | 'email.urgent'
  | 'github.pr.created'
  | 'github.issue.assigned'
  | 'github.review_requested'
  | 'github.workflow.failed'
  | 'drive.file.created'
  | 'drive.file.modified'
  | 'drive.file.shared'
  | 'calendar.event.created'
  | 'calendar.event.upcoming'
  | 'calendar.conflict.detected'
  | 'slack.mention'
  | 'slack.dm'
  | 'task.created'
  | 'task.overdue'
  | 'system.alert'
  | 'system.anomaly';

export type SignalSource =
  | 'gmail'
  | 'github'
  | 'gdrive'
  | 'gcal'
  | 'slack'
  | 'linear'
  | 'notion'
  | 'internal'
  | 'manual';

export interface SignalMetadata {
  /** Confidence level of signal detection (0-1) */
  confidence: number;
  
  /** Original source message ID if available */
  source_message_id?: string;
  
  /** Source thread/conversation ID if available */
  thread_id?: string;
  
  /** User who generated or triggered this signal */
  actor?: string;
  
  /** Tags for routing */
  tags?: string[];
  
  /** Custom properties */
  custom?: Record<string, unknown>;
}

// ============================================================================
// DECISION
// ============================================================================

export interface Decision {
  id: string;
  schema_version: "1.1.0";
  timestamp: string;
  
  /** Signal this decision is based on */
  signal_id: string;
  
  /** Decision outcome */
  outcome: DecisionOutcome;
  
  /** Priority classification */
  priority: Priority;
  
  /** Reasoning explanation */
  reasoning: string;
  
  /** Confidence in decision (0-1) */
  confidence: number;
  
  /** Policy version applied */
  policy_version: string;
  
  /** Routing destination */
  route_to?: string;
  
  /** Required approvals if any */
  requires_approval: boolean;
  
  /** Approval policy that triggered */
  approval_policy_ref?: string;
}

export type DecisionOutcome =
  | 'execute'
  | 'approve_first'
  | 'block'
  | 'escalate'
  | 'defer'
  | 'discard';

export type Priority = 'critical' | 'high' | 'medium' | 'low';

// ============================================================================
// APPROVAL REQUEST
// ============================================================================

export interface ApprovalRequest {
  id: string;
  schema_version: "1.1.0";
  timestamp: string;
  
  /** Decision that triggered this approval */
  decision_id: string;
  
  /** Signal origin */
  signal_id: string;
  
  /** Risk level assessment */
  risk_level: RiskLevel;
  
  /** Approval type required */
  approval_type: ApprovalType;
  
  /** Human-readable summary */
  summary: string;
  
  /** Suggested action if approved */
  proposed_action: string;
  
  /** Deadline for approval */
  deadline?: string;
  
  /** Approvers required */
  approvers: Approver[];
  
  /** Current status */
  status: ApprovalStatus;
  
  /** Policy that triggered this approval */
  policy_ref: string;
  
  /** Policy version */
  policy_version: string;
}

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';
export type ApprovalType = 'auto' | 'single' | 'unanimous' | 'threshold';
export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'escalated';

export interface Approver {
  id: string;
  name: string;
  role: string;
  required: boolean;
  responded: boolean;
  response?: 'approved' | 'denied';
  responded_at?: string;
}

// ============================================================================
// ACTION EXECUTION
// ============================================================================

export interface ActionExecution {
  id: string;
  schema_version: "1.1.0";
  timestamp: string;
  
  /** Decision triggering this action */
  decision_id: string;
  
  /** Approval reference if required */
  approval_id?: string;
  
  /** Signal origin */
  signal_id: string;
  
  /** Action type */
  action_type: ActionType;
  
  /** Command to execute */
  command: string;
  
  /** Parameters */
  params: Record<string, unknown>;
  
  /** Execution status */
  status: ActionStatus;
  
  /** Idempotency key for retry safety */
  idempotency_key: string;
  
  /** Retry count */
  retry_count: number;
  
  /** Max retries allowed */
  max_retries: number;
  
  /** Result if completed */
  result?: ActionResult;
  
  /** Error if failed */
  error?: ActionError;
  
  /** Policy version */
  policy_version: string;
}

export type ActionType =
  | 'execute.command'
  | 'create.task'
  | 'send.notification'
  | 'schedule.event'
  | 'create.document'
  | 'send.email'
  | 'post.message'
  | 'update.record'
  | 'trigger.webhook'
  | 'escalate';

export type ActionStatus =
  | 'pending'
  | 'queued'
  | 'executing'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'retrying'
  | 'dead_lettered';

export interface ActionResult {
  output?: Record<string, unknown>;
  duration_ms: number;
  completed_at: string;
}

export interface ActionError {
  code: string;
  message: string;
  recoverable: boolean;
  timestamp: string;
}

// ============================================================================
// RECEIPT
// ============================================================================

export interface Receipt {
  /** Unique receipt identifier */
  id: string;
  
  /** Schema version */
  schema_version: "1.1.0";
  
  /** ISO 8601 timestamp */
  timestamp: string;
  
  /** Event type that generated this receipt */
  type: ReceiptType;
  
  /** Execution status */
  status: 'success' | 'failed' | 'blocked' | 'deferred';
  
  /** Confidence level (0-1) */
  confidence: number;
  
  /** Linked signal ID */
  signal_id: string;
  
  /** Linked decision ID */
  decision_id: string;
  
  /** Linked approval ID if applicable */
  approval_id?: string;
  
  /** Linked action ID */
  action_id: string;
  
  /** Policy version applied */
  policy_version: string;
  
  /** Actor that performed the action */
  actor: string;
  
  /** Reference to detailed log */
  result_ref: string;
  
  /** Duration in milliseconds */
  duration_ms: number;
  
  /** Additional context */
  context?: Record<string, unknown>;
}

export type ReceiptType =
  | 'signal.received'
  | 'signal.classified'
  | 'decision.made'
  | 'approval.requested'
  | 'approval.granted'
  | 'approval.denied'
  | 'action.executed'
  | 'action.blocked'
  | 'action.failed'
  | 'action.retried';

// ============================================================================
// DAILY BRIEF
// ============================================================================

export interface DailyBrief {
  id: string;
  schema_version: "1.1.0";
  date: string;
  generated_at: string;
  
  /** Top priority items requiring attention */
  top_priorities: PriorityItem[];
  
  /** Actions that were blocked */
  blocked_actions: BlockedAction[];
  
  /** Approvals currently pending */
  approvals_pending: ApprovalSummary[];
  
  /** Execution success metrics */
  execution_metrics: ExecutionMetrics;
  
  /** Anomalies detected */
  anomalies: Anomaly[];
  
  /** Recommended next actions */
  recommended_actions: RecommendedAction[];
  
  /** Policy version */
  policy_version: string;
}

export interface PriorityItem {
  signal_id: string;
  type: string;
  summary: string;
  priority: Priority;
  age_hours: number;
  action_required: string;
}

export interface BlockedAction {
  action_id: string;
  signal_id: string;
  reason: string;
  policy_ref: string;
  unblock_path: string;
}

export interface ApprovalSummary {
  approval_id: string;
  summary: string;
  risk_level: RiskLevel;
  age_hours: number;
  approvers_pending: string[];
}

export interface ExecutionMetrics {
  total_signals: number;
  total_decisions: number;
  total_actions: number;
  successful_actions: number;
  failed_actions: number;
  blocked_actions: number;
  success_rate: number;
  avg_latency_ms: number;
}

export interface Anomaly {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  detected_at: string;
  affected_signals: string[];
}

export interface RecommendedAction {
  priority: number;
  action: string;
  reason: string;
  estimated_impact: string;
}

// ============================================================================
// EVENT TYPE REGISTRY
// ============================================================================

export const EVENT_TYPE_REGISTRY = {
  // Signal lifecycle
  'signal.received': { category: 'signal', requires_receipt: true },
  'signal.classified': { category: 'signal', requires_receipt: true },
  'signal.deferred': { category: 'signal', requires_receipt: true },
  'signal.discarded': { category: 'signal', requires_receipt: true },
  
  // Decision lifecycle
  'decision.made': { category: 'decision', requires_receipt: true },
  'decision.escalated': { category: 'decision', requires_receipt: true },
  
  // Approval lifecycle
  'approval.requested': { category: 'approval', requires_receipt: true },
  'approval.granted': { category: 'approval', requires_receipt: true },
  'approval.denied': { category: 'approval', requires_receipt: true },
  'approval.expired': { category: 'approval', requires_receipt: true },
  
  // Action lifecycle
  'action.queued': { category: 'action', requires_receipt: true },
  'action.executing': { category: 'action', requires_receipt: false },
  'action.succeeded': { category: 'action', requires_receipt: true },
  'action.failed': { category: 'action', requires_receipt: true },
  'action.blocked': { category: 'action', requires_receipt: true },
  'action.retrying': { category: 'action', requires_receipt: true },
  'action.dead_lettered': { category: 'action', requires_receipt: true },
} as const;

export type EventType = keyof typeof EVENT_TYPE_REGISTRY;