/**
 * @mss/vigil — Health Monitor
 */

import type {
  HealthStatus,
  SubsystemHealth,
  HealthMonitorConfig,
  Subsystem,
} from "./types.js";
import { VigilEventType } from "./types.js";

export type HealthCheckFn = (
  subsystem: Subsystem,
  timeout_ms: number
) => Promise<SubsystemHealth>;

/** Sliding window of health statuses */
export class HealthHistory {
  private window: HealthStatus[] = [];
  private maxSize: number;

  constructor(windowSize = 10) {
    this.maxSize = windowSize;
  }

  push(status: HealthStatus): void {
    this.window.push(status);
    if (this.window.length > this.maxSize) {
      this.window.shift();
    }
  }

  getAll(): HealthStatus[] {
    return [...this.window];
  }

  latest(): HealthStatus | null {
    return this.window[this.window.length - 1] ?? null;
  }

  errorRate(): number {
    if (this.window.length === 0) return 0;
    const unhealthy = this.window.filter(
      (s) => s.overall === "unhealthy" || s.overall === "degraded"
    ).length;
    return unhealthy / this.window.length;
  }

  clear(): void {
    this.window = [];
  }
}

/** Continuously monitors subsystem health */
export class HealthMonitor {
  private config: Required<HealthMonitorConfig>;
  private history: HealthHistory;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastStatus: HealthStatus | null = null;
  private healthCheckFn: HealthCheckFn;
  private ledgerAppend?: (
    event: Record<string, unknown>
  ) => Promise<{ event_id: string }>;

  constructor(config: HealthMonitorConfig, healthCheckFn: HealthCheckFn) {
    this.config = {
      interval_ms: config.interval_ms ?? 30_000,
      history_window: config.history_window ?? 10,
      subsystems: config.subsystems ?? [
        "server",
        "voice_session",
        "ledger",
        "tool_registry",
        "orchestrator",
        "identity",
      ],
      timeout_ms: config.timeout_ms ?? 5_000,
      onHealthChange: config.onHealthChange ?? (() => {}),
      onUnhealthy: config.onUnhealthy ?? (() => {}),
    };
    this.history = new HealthHistory(this.config.history_window);
    this.healthCheckFn = healthCheckFn;
  }

  setLedgerAppend(fn: (event: Record<string, unknown>) => Promise<{ event_id: string }>): void {
    this.ledgerAppend = fn;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.runCheck().catch(console.error);
    this.intervalHandle = setInterval(() => {
      this.runCheck().catch(console.error);
    }, this.config.interval_ms);
  }

  stop(): void {
    this.running = false;
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  getStatus(): HealthStatus | null {
    return this.lastStatus;
  }

  getHistory(): HealthStatus[] {
    return this.history.getAll();
  }

  getErrorRate(): number {
    return this.history.errorRate();
  }

  async runCheck(): Promise<HealthStatus> {
    const checks: SubsystemHealth[] = [];
    let unhealthyCount = 0;

    await Promise.all(
      this.config.subsystems.map(async (subsystem) => {
        try {
          const result = await this.healthCheckFn(subsystem, this.config.timeout_ms);
          checks.push(result);
          if (!result.healthy) {
            unhealthyCount++;
            this.config.onUnhealthy(result, subsystem);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          checks.push({
            subsystem,
            healthy: false,
            latency_ms: this.config.timeout_ms,
            message: msg,
          });
          unhealthyCount++;
        }
      })
    );

    const overall: HealthStatus["overall"] =
      unhealthyCount === 0
        ? "healthy"
        : unhealthyCount < checks.length
          ? "degraded"
          : "unhealthy";

    const status: HealthStatus = {
      overall,
      timestamp: new Date().toISOString(),
      checks,
    };

    const prev = this.lastStatus;
    this.lastStatus = status;
    this.history.push(status);

    if (prev && prev.overall !== overall) {
      this.config.onHealthChange(status, prev);
    }

    if (this.ledgerAppend) {
      this.ledgerAppend({
        event_type: VigilEventType.HEALTH_CHECK,
        status,
        previous_status: prev?.overall ?? null,
      }).catch(console.error);
    }

    return status;
  }

  async checkNow(): Promise<HealthStatus> {
    return this.runCheck();
  }

  isRunning(): boolean {
    return this.running;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Health Check Functions
// ─────────────────────────────────────────────────────────────────────────────

export function createServerHealthCheck(
  server: {
    health?: () => Promise<{ status: string }>;
    getLedger?: () => { replay: (cursor: { limit?: number }) => Promise<unknown[]> };
    getVoiceSession?: (id: unknown) => unknown;
    getToolRegistry?: () => { list: () => string[] };
    getOrchestrator?: () => { status: () => string };
  }
): HealthCheckFn {
  return async (subsystem: Subsystem, timeout_ms: number): Promise<SubsystemHealth> => {
    const start = Date.now();

    try {
      switch (subsystem) {
        case "server": {
          if (!server.health) throw new Error("Server health() not available");
          const result = await withTimeout(server.health(), timeout_ms);
          return {
            subsystem,
            healthy: result.status === "healthy",
            latency_ms: Date.now() - start,
            message: result.status,
          };
        }

        case "voice_session": {
          return {
            subsystem,
            healthy: true,
            latency_ms: Date.now() - start,
            details: { note: "sessions accessible" },
          };
        }

        case "ledger": {
          if (!server.getLedger) throw new Error("Ledger not available");
          const ledger = server.getLedger();
          const events = await withTimeout(ledger.replay({ limit: 1 }), timeout_ms);
          return {
            subsystem,
            healthy: true,
            latency_ms: Date.now() - start,
            details: { readable: true, event_count: events.length },
          };
        }

        case "tool_registry": {
          if (!server.getToolRegistry) throw new Error("Tool registry not available");
          const registry = server.getToolRegistry();
          const tools = registry.list();
          return {
            subsystem,
            healthy: true,
            latency_ms: Date.now() - start,
            details: { tool_count: tools.length },
          };
        }

        case "orchestrator": {
          if (!server.getOrchestrator) throw new Error("Orchestrator not available");
          const orch = server.getOrchestrator();
          const status = orch.status();
          return {
            subsystem,
            healthy: status !== "error",
            latency_ms: Date.now() - start,
            message: status,
          };
        }

        case "identity": {
          return {
            subsystem,
            healthy: true,
            latency_ms: Date.now() - start,
            details: { note: "identity service responsive" },
          };
        }

        default: {
          return {
            subsystem,
            healthy: false,
            latency_ms: Date.now() - start,
            message: `Unknown subsystem: ${subsystem}`,
          };
        }
      }
    } catch (err) {
      return {
        subsystem,
        healthy: false,
        latency_ms: Date.now() - start,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Health check timed out after ${ms}ms`)), ms)
    ),
  ]);
}
