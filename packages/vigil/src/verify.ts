/**
 * @mss/vigil — Verification Loop
 */

import type { Subsystem, VerificationResult } from "./types.js";
import type { HealthCheckFn } from "./monitor.js";

export interface VerificationCheck {
  name: string;
  check: () => Promise<boolean>;
  details?: Record<string, unknown>;
}

export class VerificationLoop {
  private maxAttempts: number;
  private healthCheckFn: HealthCheckFn;
  private checkDelayMs: number;

  constructor(
    maxAttempts = 3,
    healthCheckFn: HealthCheckFn,
    checkDelayMs = 5000
  ) {
    this.maxAttempts = maxAttempts;
    this.healthCheckFn = healthCheckFn;
    this.checkDelayMs = checkDelayMs;
  }

  async verifyFix(
    subsystem: Subsystem,
    attempts = 0
  ): Promise<VerificationResult> {
    const start = Date.now();
    let checksPassed = 0;
    let checksFailed = 0;

    try {
      const result = await this.healthCheckFn(subsystem, 5000);

      if (result.healthy) {
        checksPassed++;
      } else {
        checksFailed++;
      }

      if (result.latency_ms > 5000) {
        checksFailed++;
      } else {
        checksPassed++;
      }

      const verified = result.healthy && checksFailed === 0;

      return {
        verified,
        checks_passed: checksPassed,
        checks_failed: checksFailed,
        duration_ms: Date.now() - start,
        details: {
          subsystem_health: result,
          attempts,
        },
      };
    } catch (err) {
      return {
        verified: false,
        checks_passed: checksPassed,
        checks_failed: checksFailed + 1,
        duration_ms: Date.now() - start,
        details: {
          error: err instanceof Error ? err.message : String(err),
          attempts,
        },
      };
    }
  }

  async verifyWithRetry(
    subsystem: Subsystem,
    alternatives: string[] = [],
    attemptedSolutions: string[] = []
  ): Promise<VerificationResult & { solution_used?: string }> {
    let lastResult: VerificationResult | null = null;
    let attempts = 0;

    while (attempts < this.maxAttempts) {
      const result = await this.verifyFix(subsystem, attempts);

      if (result.verified) {
        const sol = attemptedSolutions[attempts] ?? attemptedSolutions[0];
        const ret: VerificationResult & { solution_used?: string } = {
          verified: result.verified,
          checks_passed: result.checks_passed,
          checks_failed: result.checks_failed,
          duration_ms: result.duration_ms,
          ...(result.details !== undefined && { details: result.details }),
        };
        if (sol !== undefined) ret.solution_used = sol;
        return ret;
      }

      lastResult = result;
      attempts++;

      if (attempts < this.maxAttempts) {
        await sleep(this.checkDelayMs * attempts);
      }
    }

    const base: VerificationResult & { solution_used?: string } = {
      verified: false,
      checks_passed: 0,
      checks_failed: 1,
      duration_ms: 0,
      alternatives: alternatives.slice(this.maxAttempts),
    };

    const usedSolution = attemptedSolutions[attempts - 1];
    if (usedSolution !== undefined) {
      base.solution_used = usedSolution;
    }

    return base;
  }

  async runChecks(checks: VerificationCheck[]): Promise<VerificationResult> {
    const start = Date.now();
    let checksPassed = 0;
    let checksFailed = 0;
    const results: Record<string, unknown> = {};

    for (const check of checks) {
      try {
        const passed = await check.check();
        results[check.name] = passed;
        if (passed) {
          checksPassed++;
        } else {
          checksFailed++;
        }
      } catch (err) {
        results[check.name] = {
          passed: false,
          error: err instanceof Error ? err.message : String(err),
        };
        checksFailed++;
      }
    }

    return {
      verified: checksFailed === 0,
      checks_passed: checksPassed,
      checks_failed: checksFailed,
      duration_ms: Date.now() - start,
      details: results,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
