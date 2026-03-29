/**
 * @mss/vigil — VIGIL Self-Healing Layer
 */

export * from "./types.js";

export { HealthMonitor, HealthHistory, createServerHealthCheck } from "./monitor.js";
export type { HealthCheckFn } from "./monitor.js";

export { ErrorDetector } from "./detector.js";

export { DiagnosisEngine } from "./diagnosis.js";

export {
  RepairExecutor,
  RateLimiter,
  ACTION_IDS,
  buildAction,
  solutionToActions,
} from "./executor.js";
export type { ActionContext, ActionHandler } from "./executor.js";

export { VerificationLoop } from "./verify.js";
export type { VerificationCheck } from "./verify.js";

export { EscalationHandler } from "./escalate.js";

export { MetaPromptingEngine } from "./meta.js";
export type { MetaConfig, StrategyContext } from "./meta.js";

// ─────────────────────────────────────────────────────────────────────────────
// VIGIL Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

import { HealthMonitor, createServerHealthCheck } from "./monitor.js";
import type { HealthCheckFn } from "./monitor.js";
import { ErrorDetector } from "./detector.js";
import { DiagnosisEngine } from "./diagnosis.js";
import { RepairExecutor } from "./executor.js";
import { VerificationLoop } from "./verify.js";
import { EscalationHandler } from "./escalate.js";
import { MetaPromptingEngine } from "./meta.js";
import type {
  VigilConfig,
  VigilStatus,
  HealthStatus,
  DetectedError,
  Diagnosis,
  RepairResult,
  EscalationRequest,
  Subsystem,
} from "./types.js";

export class Vigil {
  private config: VigilConfig;
  private monitor: HealthMonitor;
  private detector: ErrorDetector;
  private diagnosis: DiagnosisEngine;
  private executor: RepairExecutor;
  private verification: VerificationLoop;
  private escalation: EscalationHandler;
  private meta: MetaPromptingEngine;
  private startedAt: Date;
  private running = false;
  private repairCounts = {
    total: 0,
    successful: 0,
    failed: 0,
    escalated: 0,
  };

  constructor(config: VigilConfig = {}) {
    this.startedAt = new Date();
    this.config = config;

    // Ledger append helper
    const ledgerAppend = config.ledger
      ? (event: Record<string, unknown>) =>
          config.ledger!.append(event as any).then((r) => ({ event_id: r.event_id }))
      : undefined;

    // Initialize components
    this.detector = new ErrorDetector(config.error_patterns ?? []);
    if (ledgerAppend) this.detector.setLedgerAppend(ledgerAppend);

    this.diagnosis = new DiagnosisEngine();
    if (ledgerAppend) this.diagnosis.setLedgerAppend(ledgerAppend);

    this.executor = new RepairExecutor(
      config.max_repairs_per_minute ?? 5,
      config.max_repairs_per_hour ?? 20
    );
    if (ledgerAppend) this.executor.setLedgerAppend(ledgerAppend);

    this.escalation = new EscalationHandler(config.escalation);
    if (ledgerAppend) this.escalation.setLedgerAppend(ledgerAppend);

    // Default health check function
    const defaultHealthCheck: HealthCheckFn = async (subsystem) => ({
      subsystem,
      healthy: true,
      latency_ms: 0,
    });

    this.monitor = new HealthMonitor(config.health ?? {}, defaultHealthCheck);
    if (ledgerAppend) this.monitor.setLedgerAppend(ledgerAppend);

    this.verification = new VerificationLoop(3, defaultHealthCheck);

    this.meta = new MetaPromptingEngine();
    this.meta.setDiagnosisEngine(this.diagnosis);
    this.meta.setErrorDetector(this.detector);
  }

  bindServer(server: {
    health?: () => Promise<{ status: string }>;
    getLedger?: () => { replay: (c: { limit?: number }) => Promise<unknown[]> };
    getVoiceSession?: (id: unknown) => unknown;
    getToolRegistry?: () => { list: () => string[] };
    getOrchestrator?: () => { status: () => string };
  }): void {
    const healthCheck = createServerHealthCheck(server);
    this.monitor = new HealthMonitor(this.config.health ?? {}, healthCheck);
    if (this.config.ledger) {
      const ledgerAppend = (event: Record<string, unknown>) =>
        this.config.ledger!.append(event as any).then((r) => ({ event_id: r.event_id }));
      this.monitor.setLedgerAppend(ledgerAppend);
    }
    this.verification = new VerificationLoop(3, healthCheck);
  }

  setSmsSender(fn: (message: string) => Promise<void>): void {
    this.escalation.setSmsSender(fn);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.monitor.start();
  }

  stop(): void {
    this.running = false;
    this.monitor.stop();
  }

  async processError(
    messages: string[],
    subsystem: Subsystem,
    context?: Record<string, unknown>
  ): Promise<{
    detected: DetectedError[];
    diagnosis: Diagnosis | null;
    repair: RepairResult | null;
    verification: { verified: boolean; escalated: boolean };
  }> {
    const detected = this.detector.detect(messages, subsystem, context);

    if (detected.length === 0) {
      return { detected: [], diagnosis: null, repair: null, verification: { verified: false, escalated: false } };
    }

    const error = detected[0];
    if (!error) {
      return { detected: [], diagnosis: null, repair: null, verification: { verified: false, escalated: false } };
    }

    const diagnosis = this.diagnosis.diagnose(error);

    if (!this.config.auto_repair_enabled) {
      return {
        detected,
        diagnosis,
        repair: null,
        verification: { verified: false, escalated: false },
      };
    }

    if (this.escalation.needsEscalation(diagnosis, this.repairCounts.total + 1)) {
      const repairResult: RepairResult = {
        repair_id: crypto.randomUUID(),
        diagnosis_id: diagnosis.id,
        actions: [],
        success: false,
        timestamp: new Date().toISOString(),
        escalated: true,
        total_duration_ms: 0,
      };
      await this.escalation.createEscalation(diagnosis, repairResult, this.repairCounts.total + 1);
      this.repairCounts.total++;
      this.repairCounts.escalated++;
      return {
        detected,
        diagnosis,
        repair: repairResult,
        verification: { verified: false, escalated: true },
      };
    }

    const repair = await this.executor.execute(diagnosis, {});
    this.repairCounts.total++;

    if (repair.success) {
      this.repairCounts.successful++;
    } else {
      this.repairCounts.failed++;
      if (repair.escalated) {
        this.repairCounts.escalated++;
        await this.escalation.createEscalation(diagnosis, repair, this.repairCounts.total);
      }
    }

    const verified = await this.verification.verifyFix(subsystem);

    return {
      detected,
      diagnosis,
      repair,
      verification: { verified: verified.verified, escalated: repair.escalated },
    };
  }

  async checkHealth(): Promise<HealthStatus | null> {
    return this.monitor.checkNow();
  }

  getActiveErrors(): DetectedError[] {
    return this.detector.getActiveErrors();
  }

  getCriticalErrors(): DetectedError[] {
    return this.detector.getCriticalErrors();
  }

  getPendingEscalations(): EscalationRequest[] {
    return this.escalation.getPendingEscalations();
  }

  async approveEscalation(id: string): Promise<boolean> {
    return this.escalation.approve(id);
  }

  async rejectEscalation(id: string, reason?: string): Promise<boolean> {
    return this.escalation.reject(id, reason);
  }

  getStatus(): VigilStatus {
    return {
      running: this.running,
      health: this.monitor.getStatus(),
      active_repairs: 0,
      total_repairs: this.repairCounts.total,
      successful_repairs: this.repairCounts.successful,
      failed_repairs: this.repairCounts.failed,
      escalated_repairs: this.repairCounts.escalated,
      uptime_seconds: Math.floor((Date.now() - this.startedAt.getTime()) / 1000),
    };
  }

  getMonitor(): HealthMonitor { return this.monitor; }
  getDetector(): ErrorDetector { return this.detector; }
  getDiagnosis(): DiagnosisEngine { return this.diagnosis; }
  getExecutor(): RepairExecutor { return this.executor; }
  getEscalationHandler(): EscalationHandler { return this.escalation; }
  getMeta(): MetaPromptingEngine { return this.meta; }
}

export function createVigil(config?: VigilConfig): Vigil {
  return new Vigil(config);
}
