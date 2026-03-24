/**
 * @mss/server - Health & Metrics Endpoints
 */

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  checks: {
    ledger: boolean;
    identity: boolean;
    orchestrator: boolean;
  };
  version: string;
}

export class HealthMonitor {
  private startTime: number;
  private checks: Map<string, () => Promise<boolean>> = new Map();
  
  constructor() {
    this.startTime = Date.now();
  }
  
  registerCheck(name: string, fn: () => Promise<boolean>): void {
    this.checks.set(name, fn);
  }
  
  async getStatus(): Promise<HealthStatus> {
    const results = await Promise.all(
      Array.from(this.checks.entries()).map(async ([name, fn]) => {
        try {
          return [name, await fn()];
        } catch {
          return [name, false];
        }
      })
    );
    
    const checkResults = Object.fromEntries(results);
    const allHealthy = Object.values(checkResults).every(v => v);
    
    return {
      status: allHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      checks: {
        ledger: checkResults.ledger ?? false,
        identity: checkResults.identity ?? false,
        orchestrator: checkResults.orchestrator ?? false
      },
      version: "0.0.1"
    };
  }
}
