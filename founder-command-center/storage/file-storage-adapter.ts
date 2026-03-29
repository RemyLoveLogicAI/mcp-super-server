/**
 * Founder Command Center v1.2 — File Storage Adapter
 * 
 * File-backed persistence for local dev and rollback.
 * Preserves v1.1 local behavior.
 */

import * as fs from 'fs';
import * as path from 'path';
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

export class FileStorageAdapter implements StorageAdapter {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    const dirs = ['signals', 'decisions', 'approvals', 'actions', 'receipts', 'briefs', 'deliveries', 'dead_letters'];
    for (const dir of dirs) {
      const dirPath = path.join(this.basePath, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }
  }

  private appendToJsonl(collection: string, record: Record<string, unknown>): void {
    const filePath = path.join(this.basePath, collection, `${collection}.jsonl`);
    const line = JSON.stringify(record) + '\n';
    fs.appendFileSync(filePath, line, 'utf-8');
  }

  private readJsonl<T>(collection: string): T[] {
    const filePath = path.join(this.basePath, collection, `${collection}.jsonl`);
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as T);
  }

  private findById<T extends { id: string }>(collection: string, id: string): T | null {
    const records = this.readJsonl<T>(collection);
    return records.find(r => r.id === id) || null;
  }

  private updateRecord<T extends { id: string }>(
    collection: string,
    id: string,
    updater: (record: T) => T
  ): void {
    const filePath = path.join(this.basePath, collection, `${collection}.jsonl`);
    const records = this.readJsonl<T>(collection);
    const index = records.findIndex(r => r.id === id);
    if (index === -1) return;
    records[index] = updater(records[index]);
    fs.writeFileSync(filePath, records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf-8');
  }

  // === Signals ===
  async createSignal(input: Signal): Promise<void> {
    this.appendToJsonl('signals', input);
  }

  async updateSignalStatus(signalId: string, status: SignalStatus): Promise<void> {
    this.updateRecord<Signal>('signals', signalId, r => ({
      ...r,
      status,
      updated_at: new Date().toISOString(),
    }));
  }

  async getSignalById(signalId: string): Promise<Signal | null> {
    return this.findById<Signal>('signals', signalId);
  }

  async listSignalsByStatus(status: SignalStatus): Promise<Signal[]> {
    return this.readJsonl<Signal>('signals').filter(s => s.status === status);
  }

  // === Decisions ===
  async createDecision(input: Decision): Promise<void> {
    this.appendToJsonl('decisions', input);
  }

  async getDecisionById(decisionId: string): Promise<Decision | null> {
    return this.findById<Decision>('decisions', decisionId);
  }

  async getDecisionBySignalId(signalId: string): Promise<Decision | null> {
    const decisions = this.readJsonl<Decision>('decisions');
    return decisions.find(d => d.signal_id === signalId) || null;
  }

  // === Approvals ===
  async createApproval(input: ApprovalRequest): Promise<void> {
    this.appendToJsonl('approvals', input);
  }

  async updateApprovalResolution(params: {
    approvalId: string;
    status: ApprovalStatus;
    resolvedBy: string;
    resolutionNote?: string;
    resolvedAt: string;
  }): Promise<void> {
    this.updateRecord<ApprovalRequest>('approvals', params.approvalId, r => ({
      ...r,
      status: params.status,
      resolved_by: params.resolvedBy,
      resolution_note: params.resolutionNote,
      resolved_at: params.resolvedAt,
      updated_at: params.resolvedAt,
    }));
  }

  async getApprovalById(approvalId: string): Promise<ApprovalRequest | null> {
    return this.findById<ApprovalRequest>('approvals', approvalId);
  }

  async listPendingApprovals(): Promise<ApprovalRequest[]> {
    return this.readJsonl<ApprovalRequest>('approvals').filter(a => a.status === 'pending');
  }

  async listApprovalsByStatus(status: ApprovalStatus): Promise<ApprovalRequest[]> {
    return this.readJsonl<ApprovalRequest>('approvals').filter(a => a.status === status);
  }

  async getApprovalBySignalId(signalId: string): Promise<ApprovalRequest | null> {
    const approvals = this.readJsonl<ApprovalRequest>('approvals');
    return approvals.find(a => a.signal_id === signalId) || null;
  }

  // === Actions ===
  async createAction(input: ActionExecution): Promise<void> {
    this.appendToJsonl('actions', input);
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
    this.updateRecord<ActionExecution>('actions', params.actionId, r => ({
      ...r,
      status: params.status,
      attempt_count: params.attemptCount ?? r.attempt_count,
      last_error_code: params.lastErrorCode,
      last_error_message: params.lastErrorMessage,
      result_ref: params.resultRef,
      started_at: params.startedAt,
      completed_at: params.completedAt,
      updated_at: new Date().toISOString(),
    }));
  }

  async getActionById(actionId: string): Promise<ActionExecution | null> {
    return this.findById<ActionExecution>('actions', actionId);
  }

  async listActionsByStatus(status: ActionStatus): Promise<ActionExecution[]> {
    return this.readJsonl<ActionExecution>('actions').filter(a => a.status === status);
  }

  // === Receipts ===
  async createReceipt(input: Receipt): Promise<void> {
    this.appendToJsonl('receipts', input);
  }

  async getReceiptById(receiptId: string): Promise<Receipt | null> {
    return this.findById<Receipt>('receipts', receiptId);
  }

  async listReceiptsByCorrelationId(correlationId: string): Promise<Receipt[]> {
    return this.readJsonl<Receipt>('receipts').filter(r => r.correlation_id === correlationId);
  }

  async listReceiptsByEventType(eventType: string): Promise<Receipt[]> {
    return this.readJsonl<Receipt>('receipts').filter(r => r.event_type === eventType);
  }

  // === Briefs ===
  async createBrief(input: Brief): Promise<void> {
    this.appendToJsonl('briefs', input);
  }

  async getBriefById(briefId: string): Promise<Brief | null> {
    return this.findById<Brief>('briefs', briefId);
  }

  async getBriefByDate(briefDate: string): Promise<Brief | null> {
    const briefs = this.readJsonl<Brief>('briefs');
    return briefs.find(b => b.brief_date === briefDate) || null;
  }

  // === Brief Deliveries ===
  async createBriefDelivery(input: BriefDelivery): Promise<void> {
    this.appendToJsonl('deliveries', input);
  }

  async updateBriefDeliveryStatus(params: {
    deliveryId: string;
    status: BriefDeliveryStatus;
    providerMessageId?: string;
    errorCode?: string;
    errorMessage?: string;
    deliveredAt?: string;
  }): Promise<void> {
    this.updateRecord<BriefDelivery>('deliveries', params.deliveryId, r => ({
      ...r,
      status: params.status,
      provider_message_id: params.providerMessageId,
      error_code: params.errorCode,
      error_message: params.errorMessage,
      delivered_at: params.deliveredAt,
    }));
  }

  // === Dead Letters ===
  async createDeadLetter(input: DeadLetterRecord): Promise<void> {
    this.appendToJsonl('dead_letters', input);
  }

  async listDeadLetters(): Promise<DeadLetterRecord[]> {
    return this.readJsonl<DeadLetterRecord>('dead_letters');
  }

  // === Health ===
  async healthCheck(): Promise<{ healthy: boolean; adapter: string; latency_ms: number }> {
    const start = Date.now();
    try {
      this.ensureDirectories();
      return {
        healthy: true,
        adapter: 'FileStorageAdapter',
        latency_ms: Date.now() - start,
      };
    } catch {
      return {
        healthy: false,
        adapter: 'FileStorageAdapter',
        latency_ms: Date.now() - start,
      };
    }
  }
}