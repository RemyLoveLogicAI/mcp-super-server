/**
 * Founder Command Center v1.2 — Storage Adapter Interface
 * 
 * Abstraction layer for interchangeable persistence backends.
 * Supports file-backed (dev/fallback) and D1 (staging/production).
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type SignalStatus =
  | "received"
  | "classified"
  | "queued"
  | "awaiting_approval"
  | "approved"
  | "denied"
  | "executed"
  | "blocked"
  | "failed";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "denied"
  | "expired"
  | "cancelled";

export type ActionStatus =
  | "pending"
  | "ready"
  | "running"
  | "succeeded"
  | "blocked"
  | "failed"
  | "dead_lettered";

export type BriefDeliveryStatus =
  | "pending"
  | "sent"
  | "failed";

// ============================================================================
// SCHEMA TYPES (v1.0.0)
// ============================================================================

export interface Signal {
  id: string;
  schema_version: string;
  created_at: string;
  updated_at: string;
  source_type: string;
  source_ref?: string;
  title?: string;
  body: string;
  priority?: string;
  confidence?: number;
  status: SignalStatus;
  signal_type?: string;
  metadata_json: string;
  raw_payload_json?: string;
  correlation_id?: string;
}

export interface Decision {
  id: string;
  schema_version: string;
  created_at: string;
  signal_id: string;
  decision_type: string;
  recommended_action?: string;
  priority: string;
  confidence: number;
  requires_approval: boolean;
  rationale?: string;
  policy_version: string;
  metadata_json: string;
  correlation_id?: string;
}

export interface ApprovalRequest {
  id: string;
  schema_version: string;
  created_at: string;
  updated_at: string;
  signal_id: string;
  decision_id: string;
  requested_by: string;
  assigned_to?: string;
  status: ApprovalStatus;
  reason?: string;
  resolution_note?: string;
  resolved_by?: string;
  resolved_at?: string;
  policy_version: string;
  metadata_json: string;
  correlation_id?: string;
}

export interface ActionExecution {
  id: string;
  schema_version: string;
  created_at: string;
  updated_at: string;
  signal_id: string;
  decision_id: string;
  approval_id?: string;
  action_type: string;
  status: ActionStatus;
  target_ref?: string;
  attempt_count: number;
  last_error_code?: string;
  last_error_message?: string;
  result_ref?: string;
  started_at?: string;
  completed_at?: string;
  policy_version: string;
  metadata_json: string;
  correlation_id?: string;
}

export interface Receipt {
  id: string;
  schema_version: string;
  created_at: string;
  event_type: string;
  status: string;
  signal_id?: string;
  decision_id?: string;
  approval_id?: string;
  action_id?: string;
  brief_id?: string;
  confidence?: number;
  policy_version?: string;
  actor: string;
  result_ref?: string;
  error_code?: string;
  payload_json: string;
  correlation_id?: string;
}

export interface Brief {
  id: string;
  schema_version: string;
  created_at: string;
  brief_date: string;
  status: string;
  summary_markdown: string;
  blocked_count: number;
  pending_approval_count: number;
  success_count: number;
  failure_count: number;
  anomalies_json: string;
  recommendations_json: string;
  source_window_start: string;
  source_window_end: string;
  metadata_json: string;
}

export interface BriefDelivery {
  id: string;
  created_at: string;
  brief_id: string;
  channel: string;
  destination: string;
  status: BriefDeliveryStatus;
  provider_message_id?: string;
  error_code?: string;
  error_message?: string;
  delivered_at?: string;
  metadata_json: string;
}

export interface DeadLetterRecord {
  id: string;
  created_at: string;
  source_table: string;
  source_id: string;
  error_code: string;
  error_message: string;
  payload_json: string;
  retry_count: number;
  policy_version?: string;
  correlation_id?: string;
}

// ============================================================================
// STORAGE ADAPTER INTERFACE
// ============================================================================

export interface StorageAdapter {
  // Signals
  createSignal(input: Signal): Promise<void>;
  updateSignalStatus(signalId: string, status: SignalStatus): Promise<void>;
  getSignalById(signalId: string): Promise<Signal | null>;
  listSignalsByStatus(status: SignalStatus): Promise<Signal[]>;

  // Decisions
  createDecision(input: Decision): Promise<void>;
  getDecisionById(decisionId: string): Promise<Decision | null>;
  getDecisionBySignalId(signalId: string): Promise<Decision | null>;

  // Approvals
  createApproval(input: ApprovalRequest): Promise<void>;
  updateApprovalResolution(params: {
    approvalId: string;
    status: ApprovalStatus;
    resolvedBy: string;
    resolutionNote?: string;
    resolvedAt: string;
  }): Promise<void>;
  getApprovalById(approvalId: string): Promise<ApprovalRequest | null>;
  listPendingApprovals(): Promise<ApprovalRequest[]>;
  listApprovalsByStatus(status: ApprovalStatus): Promise<ApprovalRequest[]>;

  // Actions
  createAction(input: ActionExecution): Promise<void>;
  updateActionStatus(params: {
    actionId: string;
    status: ActionStatus;
    attemptCount?: number;
    lastErrorCode?: string;
    lastErrorMessage?: string;
    resultRef?: string;
    startedAt?: string;
    completedAt?: string;
  }): Promise<void>;
  getActionById(actionId: string): Promise<ActionExecution | null>;
  listActionsByStatus(status: ActionStatus): Promise<ActionExecution[]>;

  // Receipts
  createReceipt(input: Receipt): Promise<void>;
  getReceiptById(receiptId: string): Promise<Receipt | null>;
  listReceiptsByCorrelationId(correlationId: string): Promise<Receipt[]>;
  listReceiptsByEventType(eventType: string): Promise<Receipt[]>;

  // Briefs
  createBrief(input: Brief): Promise<void>;
  getBriefById(briefId: string): Promise<Brief | null>;
  getBriefByDate(briefDate: string): Promise<Brief | null>;

  // Brief Deliveries
  createBriefDelivery(input: BriefDelivery): Promise<void>;
  updateBriefDeliveryStatus(params: {
    deliveryId: string;
    status: BriefDeliveryStatus;
    providerMessageId?: string;
    errorCode?: string;
    errorMessage?: string;
    deliveredAt?: string;
  }): Promise<void>;

  // Dead Letters
  createDeadLetter(input: DeadLetterRecord): Promise<void>;
  listDeadLetters(): Promise<DeadLetterRecord[]>;

  // Health
  healthCheck(): Promise<{ healthy: boolean; adapter: string; latency_ms: number }>;
}