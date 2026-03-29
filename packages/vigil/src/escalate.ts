/**
 * @mss/vigil — Escalation Handler
 */

import type {
  EscalationRequest,
  EscalationConfig,
  EscalationPriority,
  Diagnosis,
  RepairResult,
} from "./types.js";
import { VigilEventType } from "./types.js";

export class EscalationHandler {
  private config: {
    min_confidence_threshold: number;
    max_auto_attempts: number;
    response_timeout_ms: number;
    notify_sms: boolean;
    approval_gate_url: string;
  };
  private pendingEscalations: Map<string, EscalationRequest> = new Map();
  private approvalCallbacks: Map<string, (approved: boolean) => void> = new Map();
  private ledgerAppend?: (
    event: Record<string, unknown>
  ) => Promise<{ event_id: string }>;
  private smsSender?: (message: string) => Promise<void>;

  constructor(config: EscalationConfig = {}) {
    this.config = {
      min_confidence_threshold: config.min_confidence_threshold ?? 0.7,
      max_auto_attempts: config.max_auto_attempts ?? 3,
      response_timeout_ms: config.response_timeout_ms ?? 300_000,
      notify_sms: config.notify_sms ?? false,
      approval_gate_url: config.approval_gate_url ?? "",
    };
  }

  setLedgerAppend(fn: (event: Record<string, unknown>) => Promise<{ event_id: string }>): void {
    this.ledgerAppend = fn;
  }

  setSmsSender(fn: (message: string) => Promise<void>): void {
    this.smsSender = fn;
  }

  needsEscalation(diagnosis: Diagnosis, attemptCount: number): boolean {
    if (diagnosis.confidence < this.config.min_confidence_threshold) {
      return true;
    }
    if (attemptCount >= this.config.max_auto_attempts) {
      return true;
    }
    return false;
  }

  determinePriority(diagnosis: Diagnosis): EscalationPriority {
    const rootCause = diagnosis.root_causes[0];
    if (rootCause?.subsystem === "server" && diagnosis.confidence < 0.3) return "critical";
    if (diagnosis.confidence < 0.3) return "high";
    if (diagnosis.confidence < 0.5) return "medium";
    return "low";
  }

  async createEscalation(
    diagnosis: Diagnosis,
    repairResult: RepairResult,
    attemptCount: number
  ): Promise<EscalationRequest> {
    const id = crypto.randomUUID();
    const now = new Date();

    const escalation: EscalationRequest = {
      id,
      timestamp: now.toISOString(),
      priority: this.determinePriority(diagnosis),
      repair_id: repairResult.repair_id,
      diagnosis,
      summary: this.buildSummary(diagnosis, repairResult, attemptCount),
      actions_taken: repairResult.actions.map((a) => a.action_id),
      confidence: diagnosis.confidence,
      status: "pending",
      response_deadline: new Date(
        now.getTime() + this.config.response_timeout_ms
      ).toISOString(),
    };

    this.pendingEscalations.set(id, escalation);

    if (this.ledgerAppend) {
      this.ledgerAppend({
        event_type: VigilEventType.ESCALATION_CREATED,
        escalation,
      }).catch(console.error);
    }

    if (this.config.notify_sms && this.smsSender) {
      const message = this.buildSmsMessage(escalation);
      this.smsSender(message).catch(console.error);
    }

    if (this.config.approval_gate_url) {
      this.callApprovalGate(escalation).catch(console.error);
    }

    return escalation;
  }

  async approve(id: string): Promise<boolean> {
    const escalation = this.pendingEscalations.get(id);
    if (!escalation) return false;

    escalation.status = "approved";

    if (this.ledgerAppend) {
      this.ledgerAppend({
        event_type: VigilEventType.ESCALATION_APPROVED,
        escalation_id: id,
        timestamp: new Date().toISOString(),
      }).catch(console.error);
    }

    const callback = this.approvalCallbacks.get(id);
    if (callback) {
      callback(true);
      this.approvalCallbacks.delete(id);
    }

    return true;
  }

  async reject(id: string, reason?: string): Promise<boolean> {
    const escalation = this.pendingEscalations.get(id);
    if (!escalation) return false;

    escalation.status = "rejected";

    if (this.ledgerAppend) {
      this.ledgerAppend({
        event_type: VigilEventType.ESCALATION_REJECTED,
        escalation_id: id,
        reason,
        timestamp: new Date().toISOString(),
      }).catch(console.error);
    }

    const callback = this.approvalCallbacks.get(id);
    if (callback) {
      callback(false);
      this.approvalCallbacks.delete(id);
    }

    return true;
  }

  getPendingEscalations(): EscalationRequest[] {
    return [...this.pendingEscalations.values()].filter(
      (e) => e.status === "pending"
    );
  }

  getEscalation(id: string): EscalationRequest | undefined {
    return this.pendingEscalations.get(id);
  }

  async waitForApproval(id: string): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.approvalCallbacks.delete(id);
        this.reject(id, "Approval timeout");
        resolve(false);
      }, this.config.response_timeout_ms);

      this.approvalCallbacks.set(id, (approved) => {
        clearTimeout(timeout);
        resolve(approved);
      });
    });
  }

  private buildSummary(
    diagnosis: Diagnosis,
    repairResult: RepairResult,
    attemptCount: number
  ): string {
    const lines: string[] = [];

    lines.push(`VIGIL ESCALATION [${attemptCount}/${this.config.max_auto_attempts} attempts]`);
    lines.push(`Error: ${diagnosis.error_id}`);
    lines.push(`Confidence: ${(diagnosis.confidence * 100).toFixed(0)}%`);
    lines.push(`Top Solution: ${diagnosis.solutions[0]?.description ?? "none"}`);
    lines.push(`Repair Success: ${repairResult.success}`);

    if (diagnosis.root_causes[0]) {
      lines.push(`Root Cause: ${diagnosis.root_causes[0].description}`);
    }

    return lines.join(" | ");
  }

  private buildSmsMessage(escalation: EscalationRequest): string {
    const priority = escalation.priority.toUpperCase();
    const conf = (escalation.confidence * 100).toFixed(0);
    const deadline = new Date(escalation.response_deadline ?? 0).toLocaleTimeString();

    return `[VIGIL ${priority}] Self-healing failed. Confidence: ${conf}%. ` +
      `Summary: ${escalation.summary}. ` +
      `Reply required by ${deadline}.`;
  }

  private async callApprovalGate(escalation: EscalationRequest): Promise<void> {
    if (!this.config.approval_gate_url) return;

    try {
      const response = await fetch(this.config.approval_gate_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(escalation),
      });

      if (response.ok) {
        const result = await response.json() as { approved: boolean };
        if (result.approved) {
          await this.approve(escalation.id);
        } else {
          await this.reject(escalation.id, result as unknown as string);
        }
      }
    } catch (err) {
      console.error("Approval gate call failed:", err);
    }
  }
}
