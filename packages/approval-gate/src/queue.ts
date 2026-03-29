/**
 * @mss/approval-gate - Queue
 * In-memory approval queue with TTL auto-expire and priority handling
 */

import { nanoid } from "nanoid";
import {
  ApprovalRequest,
  CreateApprovalRequest,
  getDefaultTimeout,
  RiskLevel,
} from "./schema.js";

/**
 * Priority order for risk levels (lower number = higher priority).
 */
const RISK_PRIORITY: Record<RiskLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Audit entry for ledger persistence.
 */
export interface ApprovalAuditEntry {
  event: "created" | "approved" | "denied" | "expired";
  request_id: string;
  timestamp: string;
  actor?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Approval queue configuration.
 */
export interface ApprovalQueueConfig {
  /** Auto-expire pending requests after timeout */
  autoExpire: boolean;
  /** Auto-approve reversible actions on timeout */
  autoApproveReversible: boolean;
  /** Ledger interface for audit persistence */
  ledger?: {
    append: (event: ApprovalAuditEntry) => Promise<void>;
  };
}

/**
 * Default queue configuration.
 */
export const DEFAULT_QUEUE_CONFIG: ApprovalQueueConfig = {
  autoExpire: true,
  autoApproveReversible: true,
};

/**
 * In-memory approval queue.
 */
export class ApprovalQueue {
  private requests: Map<string, ApprovalRequest> = new Map();
  private config: ApprovalQueueConfig;
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(config: Partial<ApprovalQueueConfig> = {}) {
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
  }

  /**
   * Create a new approval request.
   */
  async create(request: CreateApprovalRequest): Promise<ApprovalRequest> {
    const timeout_ms = request.timeout_ms ?? getDefaultTimeout(request.risk_level);
    const approvalRequest: ApprovalRequest = {
      id: nanoid(),
      action: request.action,
      risk_level: request.risk_level,
      reversibility: request.reversibility,
      timeout_ms,
      created_at: new Date().toISOString(),
      context: request.context ?? {},
      proposed_by: request.proposed_by,
      status: "pending",
    };

    this.requests.set(approvalRequest.id, approvalRequest);
    this.scheduleExpiration(approvalRequest.id, timeout_ms);
    await this.audit({ event: "created", request_id: approvalRequest.id, timestamp: approvalRequest.created_at, metadata: { action: request.action, risk_level: request.risk_level } });

    return approvalRequest;
  }

  /**
   * Get a request by ID.
   */
  get(id: string): ApprovalRequest | undefined {
    return this.requests.get(id);
  }

  /**
   * Get all pending requests sorted by priority.
   */
  getPending(): ApprovalRequest[] {
    return Array.from(this.requests.values())
      .filter((r) => r.status === "pending")
      .sort((a, b) => {
        const priorityA = RISK_PRIORITY[a.risk_level];
        const priorityB = RISK_PRIORITY[b.risk_level];
        if (priorityA !== priorityB) return priorityA - priorityB;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
  }

  /**
   * Approve a request.
   */
  async approve(id: string, actor?: string): Promise<ApprovalRequest | null> {
    const request = this.requests.get(id);
    if (!request || request.status !== "pending") return null;

    request.status = "approved";
    this.clearTimer(id);
    const auditEntry: ApprovalAuditEntry = { event: "approved", request_id: id, timestamp: new Date().toISOString() };
    if (actor) auditEntry.actor = actor;
    await this.audit(auditEntry);

    return request;
  }

  /**
   * Deny a request.
   */
  async deny(id: string, actor?: string): Promise<ApprovalRequest | null> {
    const request = this.requests.get(id);
    if (!request || request.status !== "pending") return null;

    request.status = "denied";
    this.clearTimer(id);
    const auditEntry: ApprovalAuditEntry = { event: "denied", request_id: id, timestamp: new Date().toISOString() };
    if (actor) auditEntry.actor = actor;
    await this.audit(auditEntry);

    return request;
  }

  /**
   * Expire a request (called automatically by timer).
   */
  private async expire(id: string): Promise<ApprovalRequest | null> {
    const request = this.requests.get(id);
    if (!request || request.status !== "pending") return null;

    request.status = "expired";
    this.timers.delete(id);
    await this.audit({ event: "expired", request_id: id, timestamp: new Date().toISOString() });

    return request;
  }

  /**
   * Schedule automatic expiration for a request.
   */
  private scheduleExpiration(id: string, timeout_ms: number): void {
    if (!this.config.autoExpire) return;

    const timer = setTimeout(async () => {
      const request = this.requests.get(id);
      if (!request || request.status !== "pending") return;

      if (this.config.autoApproveReversible && request.reversibility) {
        await this.approve(id, "system:timeout_auto_approve");
      } else {
        await this.expire(id);
      }
    }, timeout_ms);

    this.timers.set(id, timer);
  }

  /**
   * Clear expiration timer for a request.
   */
  private clearTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  /**
   * Record audit entry.
   */
  private async audit(entry: ApprovalAuditEntry): Promise<void> {
    if (this.config.ledger) {
      await this.config.ledger.append(entry);
    }
  }

  /**
   * Get queue statistics.
   */
  stats(): { pending: number; by_risk: Record<RiskLevel, number> } {
    const pending = this.getPending();
    const by_risk: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const p of pending) {
      by_risk[p.risk_level]++;
    }
    return { pending: pending.length, by_risk };
  }

  /**
   * Clear all pending requests (for testing).
   */
  clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.requests.clear();
  }
}
