/**
 * Founder Command Center v1.2 — D1 Storage Adapter
 * 
 * Primary persistence for staging/production.
 * Wire to Cloudflare D1 or local D1-compatible SQLite.
 */

import type {
  StorageAdapter,
  Signal,
  Decision,
  ApprovalRequest,
  ActionExecution,
  Receipt,
  Brief,
  BriefDelivery,
  DeadLetterRecord,
  SignalStatus,
  ApprovalStatus,
  ActionStatus,
  BriefDeliveryStatus,
} from './storage-adapter';

// D1-like database interface
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta: { changes: number } }>;
}

export class D1StorageAdapter implements StorageAdapter {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  // === Signals ===
  async createSignal(input: Signal): Promise<void> {
    await this.db
      .prepare(`
        INSERT INTO signals (id, schema_version, created_at, updated_at, source_type, source_ref, title, body, priority, confidence, status, signal_type, metadata_json, raw_payload_json, correlation_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        input.id,
        input.schema_version,
        input.created_at,
        input.updated_at,
        input.source_type,
        input.source_ref ?? null,
        input.title ?? null,
        input.body,
        input.priority ?? null,
        input.confidence ?? null,
        input.status,
        input.signal_type ?? null,
        input.metadata_json,
        input.raw_payload_json ?? null,
        input.correlation_id ?? null
      )
      .run();
  }

  async updateSignalStatus(signalId: string, status: SignalStatus): Promise<void> {
    await this.db
      .prepare(`
        UPDATE signals SET status = ?, updated_at = ? WHERE id = ?
      `)
      .bind(status, new Date().toISOString(), signalId)
      .run();
  }

  async getSignalById(signalId: string): Promise<Signal | null> {
    return this.db
      .prepare(`SELECT * FROM signals WHERE id = ?`)
      .bind(signalId)
      .first<Signal>();
  }

  async listSignalsByStatus(status: SignalStatus): Promise<Signal[]> {
    const result = await this.db
      .prepare(`SELECT * FROM signals WHERE status = ? ORDER BY created_at DESC`)
      .bind(status)
      .all<Signal>();
    return result.results;
  }

  // === Decisions ===
  async createDecision(input: Decision): Promise<void> {
    await this.db
      .prepare(`
        INSERT INTO decisions (id, schema_version, created_at, signal_id, decision_type, recommended_action, priority, confidence, requires_approval, rationale, policy_version, metadata_json, correlation_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        input.id,
        input.schema_version,
        input.created_at,
        input.signal_id,
        input.decision_type,
        input.recommended_action ?? null,
        input.priority,
        input.confidence,
        input.requires_approval ? 1 : 0,
        input.rationale ?? null,
        input.policy_version,
        input.metadata_json,
        input.correlation_id ?? null
      )
      .run();
  }

  async getDecisionById(decisionId: string): Promise<Decision | null> {
    const row = await this.db
      .prepare(`SELECT * FROM decisions WHERE id = ?`)
      .bind(decisionId)
      .first<Record<string, unknown>>();
    return row ? this.mapDecisionRow(row) : null;
  }

  async getDecisionBySignalId(signalId: string): Promise<Decision | null> {
    const row = await this.db
      .prepare(`SELECT * FROM decisions WHERE signal_id = ?`)
      .bind(signalId)
      .first<Record<string, unknown>>();
    return row ? this.mapDecisionRow(row) : null;
  }

  private mapDecisionRow(row: Record<string, unknown>): Decision {
    return {
      ...row,
      requires_approval: row.requires_approval === 1,
    } as Decision;
  }

  // === Approvals ===
  async createApproval(input: ApprovalRequest): Promise<void> {
    await this.db
      .prepare(`
        INSERT INTO approvals (id, schema_version, created_at, updated_at, signal_id, decision_id, requested_by, assigned_to, status, reason, resolution_note, resolved_by, resolved_at, policy_version, metadata_json, correlation_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        input.id,
        input.schema_version,
        input.created_at,
        input.updated_at,
        input.signal_id,
        input.decision_id,
        input.requested_by,
        input.assigned_to ?? null,
        input.status,
        input.reason ?? null,
        input.resolution_note ?? null,
        input.resolved_by ?? null,
        input.resolved_at ?? null,
        input.policy_version,
        input.metadata_json,
        input.correlation_id ?? null
      )
      .run();
  }

  async updateApprovalResolution(params: {
    approvalId: string;
    status: ApprovalStatus;
    resolvedBy: string;
    resolutionNote?: string;
    resolvedAt: string;
  }): Promise<void> {
    await this.db
      .prepare(`
        UPDATE approvals SET status = ?, resolved_by = ?, resolution_note = ?, resolved_at = ?, updated_at = ? WHERE id = ?
      `)
      .bind(params.status, params.resolvedBy, params.resolutionNote ?? null, params.resolvedAt, params.resolvedAt, params.approvalId)
      .run();
  }

  async getApprovalById(approvalId: string): Promise<ApprovalRequest | null> {
    return this.db
      .prepare(`SELECT * FROM approvals WHERE id = ?`)
      .bind(approvalId)
      .first<ApprovalRequest>();
  }

  async listPendingApprovals(): Promise<ApprovalRequest[]> {
    const result = await this.db
      .prepare(`SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at DESC`)
      .all<ApprovalRequest>();
    return result.results;
  }

  async listApprovalsByStatus(status: ApprovalStatus): Promise<ApprovalRequest[]> {
    const result = await this.db
      .prepare(`SELECT * FROM approvals WHERE status = ? ORDER BY created_at DESC`)
      .bind(status)
      .all<ApprovalRequest>();
    return result.results;
  }

  // === Actions ===
  async createAction(input: ActionExecution): Promise<void> {
    await this.db
      .prepare(`
        INSERT INTO actions (id, schema_version, created_at, updated_at, signal_id, decision_id, approval_id, action_type, status, target_ref, attempt_count, last_error_code, last_error_message, result_ref, started_at, completed_at, policy_version, metadata_json, correlation_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        input.id,
        input.schema_version,
        input.created_at,
        input.updated_at,
        input.signal_id,
        input.decision_id,
        input.approval_id ?? null,
        input.action_type,
        input.status,
        input.target_ref ?? null,
        input.attempt_count,
        input.last_error_code ?? null,
        input.last_error_message ?? null,
        input.result_ref ?? null,
        input.started_at ?? null,
        input.completed_at ?? null,
        input.policy_version,
        input.metadata_json,
        input.correlation_id ?? null
      )
      .run();
  }

  async updateActionStatus(params: {
    actionId: string;
    status: ActionStatus;
    attemptCount?: number;
    lastErrorCode?: string;
    lastErrorMessage?: string;
    resultRef?: string;
    startedAt?: string;
    completedAt?: string;
  }): Promise<void> {
    await this.db
      .prepare(`
        UPDATE actions SET status = ?, attempt_count = ?, last_error_code = ?, last_error_message = ?, result_ref = ?, started_at = ?, completed_at = ?, updated_at = ? WHERE id = ?
      `)
      .bind(
        params.status,
        params.attemptCount ?? 0,
        params.lastErrorCode ?? null,
        params.lastErrorMessage ?? null,
        params.resultRef ?? null,
        params.startedAt ?? null,
        params.completedAt ?? null,
        new Date().toISOString(),
        params.actionId
      )
      .run();
  }

  async getActionById(actionId: string): Promise<ActionExecution | null> {
    return this.db
      .prepare(`SELECT * FROM actions WHERE id = ?`)
      .bind(actionId)
      .first<ActionExecution>();
  }

  async listActionsByStatus(status: ActionStatus): Promise<ActionExecution[]> {
    const result = await this.db
      .prepare(`SELECT * FROM actions WHERE status = ? ORDER BY created_at DESC`)
      .bind(status)
      .all<ActionExecution>();
    return result.results;
  }

  // === Receipts ===
  async createReceipt(input: Receipt): Promise<void> {
    await this.db
      .prepare(`
        INSERT INTO receipts (id, schema_version, created_at, event_type, status, signal_id, decision_id, approval_id, action_id, brief_id, confidence, policy_version, actor, result_ref, error_code, payload_json, correlation_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        input.id,
        input.schema_version,
        input.created_at,
        input.event_type,
        input.status,
        input.signal_id ?? null,
        input.decision_id ?? null,
        input.approval_id ?? null,
        input.action_id ?? null,
        input.brief_id ?? null,
        input.confidence ?? null,
        input.policy_version ?? null,
        input.actor,
        input.result_ref ?? null,
        input.error_code ?? null,
        input.payload_json,
        input.correlation_id ?? null
      )
      .run();
  }

  async getReceiptById(receiptId: string): Promise<Receipt | null> {
    return this.db
      .prepare(`SELECT * FROM receipts WHERE id = ?`)
      .bind(receiptId)
      .first<Receipt>();
  }

  async listReceiptsByCorrelationId(correlationId: string): Promise<Receipt[]> {
    const result = await this.db
      .prepare(`SELECT * FROM receipts WHERE correlation_id = ? ORDER BY created_at ASC`)
      .bind(correlationId)
      .all<Receipt>();
    return result.results;
  }

  async listReceiptsByEventType(eventType: string): Promise<Receipt[]> {
    const result = await this.db
      .prepare(`SELECT * FROM receipts WHERE event_type = ? ORDER BY created_at DESC`)
      .bind(eventType)
      .all<Receipt>();
    return result.results;
  }

  // === Briefs ===
  async createBrief(input: Brief): Promise<void> {
    await this.db
      .prepare(`
        INSERT INTO briefs (id, schema_version, created_at, brief_date, status, summary_markdown, blocked_count, pending_approval_count, success_count, failure_count, anomalies_json, recommendations_json, source_window_start, source_window_end, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        input.id,
        input.schema_version,
        input.created_at,
        input.brief_date,
        input.status,
        input.summary_markdown,
        input.blocked_count,
        input.pending_approval_count,
        input.success_count,
        input.failure_count,
        input.anomalies_json,
        input.recommendations_json,
        input.source_window_start,
        input.source_window_end,
        input.metadata_json
      )
      .run();
  }

  async getBriefById(briefId: string): Promise<Brief | null> {
    return this.db
      .prepare(`SELECT * FROM briefs WHERE id = ?`)
      .bind(briefId)
      .first<Brief>();
  }

  async getBriefByDate(briefDate: string): Promise<Brief | null> {
    return this.db
      .prepare(`SELECT * FROM briefs WHERE brief_date = ?`)
      .bind(briefDate)
      .first<Brief>();
  }

  // === Brief Deliveries ===
  async createBriefDelivery(input: BriefDelivery): Promise<void> {
    await this.db
      .prepare(`
        INSERT INTO brief_deliveries (id, created_at, brief_id, channel, destination, status, provider_message_id, error_code, error_message, delivered_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        input.id,
        input.created_at,
        input.brief_id,
        input.channel,
        input.destination,
        input.status,
        input.provider_message_id ?? null,
        input.error_code ?? null,
        input.error_message ?? null,
        input.delivered_at ?? null,
        input.metadata_json
      )
      .run();
  }

  async updateBriefDeliveryStatus(params: {
    deliveryId: string;
    status: BriefDeliveryStatus;
    providerMessageId?: string;
    errorCode?: string;
    errorMessage?: string;
    deliveredAt?: string;
  }): Promise<void> {
    await this.db
      .prepare(`
        UPDATE brief_deliveries SET status = ?, provider_message_id = ?, error_code = ?, error_message = ?, delivered_at = ? WHERE id = ?
      `)
      .bind(
        params.status,
        params.providerMessageId ?? null,
        params.errorCode ?? null,
        params.errorMessage ?? null,
        params.deliveredAt ?? null,
        params.deliveryId
      )
      .run();
  }

  // === Dead Letters ===
  async createDeadLetter(input: DeadLetterRecord): Promise<void> {
    await this.db
      .prepare(`
        INSERT INTO dead_letters (id, created_at, source_table, source_id, error_code, error_message, payload_json, retry_count, policy_version, correlation_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        input.id,
        input.created_at,
        input.source_table,
        input.source_id,
        input.error_code,
        input.error_message,
        input.payload_json,
        input.retry_count,
        input.policy_version ?? null,
        input.correlation_id ?? null
      )
      .run();
  }

  async listDeadLetters(): Promise<DeadLetterRecord[]> {
    const result = await this.db
      .prepare(`SELECT * FROM dead_letters ORDER BY created_at DESC`)
      .all<DeadLetterRecord>();
    return result.results;
  }

  // === Health ===
  async healthCheck(): Promise<{ healthy: boolean; adapter: string; latency_ms: number }> {
    const start = Date.now();
    try {
      await this.db.prepare(`SELECT 1`).first();
      return {
        healthy: true,
        adapter: 'D1StorageAdapter',
        latency_ms: Date.now() - start,
      };
    } catch {
      return {
        healthy: false,
        adapter: 'D1StorageAdapter',
        latency_ms: Date.now() - start,
      };
    }
  }
}