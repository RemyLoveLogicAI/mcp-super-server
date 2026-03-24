#!/usr/bin/env bun

/**
 * MCP Super-Server — Health Check Script
 * 
 * Tests all subsystems:
 * - Server health endpoint
 * - Voice session creation
 * - Tool registry access
 * - Ledger read/write
 * 
 * Run: bun scripts/health_check.ts
 */

import { MCPSuperServer, createServer } from "../apps/server/src/index.js";
import { generateToolId, generateCanonicalUserId } from "../packages/core/src/testing.js";
import type { ToolDescriptor } from "../packages/core/src/resources/tool.js";
import type { SessionId, ToolId, CapabilityTag } from "../packages/core/src/ids.js";

// ANSI color codes
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";

interface HealthCheckResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: Record<string, unknown>;
}

class HealthChecker {
  private server: MCPSuperServer;
  private results: HealthCheckResult[] = [];
  private startTime: number;

  constructor() {
    this.server = createServer({
      ledger: { type: "memory" },
      gate: {
        maxCallsPerSession: 10,
        defaultApproval: "auto",
      },
      meta: {
        name: "health-check-server",
        version: "0.0.1",
        environment: "health-check",
      },
    });
    this.startTime = Date.now();
  }

  async initialize(): Promise<void> {
    await this.server.start();
  }

  async shutdown(): Promise<void> {
    await this.server.stop();
  }

  private async runCheck(
    name: string,
    fn: () => Promise<void>
  ): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await fn();
      const duration = Date.now() - start;
      const result: HealthCheckResult = { name, passed: true, duration };
      this.results.push(result);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      const result: HealthCheckResult = {
        name,
        passed: false,
        duration,
        error: error instanceof Error ? error.message : String(error),
      };
      this.results.push(result);
      return result;
    }
  }

  async runAllChecks(): Promise<HealthCheckResult[]> {
    console.log(`${BLUE}╔═══════════════════════════════════════════════════════════════╗${RESET}`);
    console.log(`${BLUE}║           MCP SUPER-SERVER — HEALTH CHECK                     ║${RESET}`);
    console.log(`${BLUE}╠═══════════════════════════════════════════════════════════════╣${RESET}`);
    console.log(`${BLUE}║  Time: ${new Date().toISOString()}${RESET}`);
    console.log(`${BLUE}╚═══════════════════════════════════════════════════════════════╝${RESET}\n`);

    // Test 1: Server Health
    await this.runCheck("Server Health", async () => {
      const health = await this.server.health();
      if (health.status !== "healthy") {
        throw new Error(`Health status is ${health.status}, expected healthy`);
      }
      if (!health.checks.ledger || !health.checks.identity || !health.checks.orchestrator) {
        throw new Error("Missing health check components");
      }
    });

    // Test 2: Server Status
    await this.runCheck("Server Status", async () => {
      const status = this.server.getStatus();
      if (!status.version || !status.environment) {
        throw new Error("Missing status fields");
      }
    });

    // Test 3: Identity Resolution
    const testUserId = generateCanonicalUserId();
    await this.runCheck("Identity Resolution", async () => {
      const result = await this.server.resolveIdentity("custom", testUserId as string);
      if (!result.canonicalUserId) {
        throw new Error("Failed to resolve identity");
      }
    });

    // Test 4: Voice Session Creation
    let sessionId: SessionId;
    await this.runCheck("Voice Session Creation", async () => {
      const identity = await this.server.resolveIdentity("custom", "voice_test_user");
      const result = this.server.createVoiceSession(identity.canonicalUserId, "custom");
      sessionId = result.sessionId as SessionId;
      if (!sessionId) {
        throw new Error("Failed to create voice session");
      }
    });

    // Test 5: Voice FSM State Transitions
    await this.runCheck("Voice FSM Transitions", async () => {
      const result1 = await this.server.processVoiceEvent(sessionId, { type: "AUDIO_START" });
      if (result1.state !== "listening") {
        throw new Error(`Expected state 'listening', got '${result1.state}'`);
      }

      const result2 = await this.server.processVoiceEvent(sessionId, {
        type: "ASR_FINAL",
        text: "test command",
      });
      if (result2.state !== "processing") {
        throw new Error(`Expected state 'processing', got '${result2.state}'`);
      }
    });

    // Test 6: Tool Registry Access
    const testToolId = generateToolId();
    await this.runCheck("Tool Registry Access", async () => {
      const tool: ToolDescriptor = {
        tool_id: testToolId as ToolId,
        version: "1.0.0",
        name: "Health Check Tool",
        description: "A test tool for health checks",
        capabilities: ["test"] as CapabilityTag[],
        side_effect_class: "read_only",
        available: true,
      };
      this.server.registerTool(tool);
    });

    // Test 7: Tool Gate Evaluation
    await this.runCheck("Tool Gate Evaluation", async () => {
      const identity = await this.server.resolveIdentity("custom", "tool_test_user");
      const { sessionId: toolSessionId } = this.server.createVoiceSession(
        identity.canonicalUserId,
        "custom"
      );

      const result = await this.server.evaluateToolCall({
        canonical_user_id: identity.canonicalUserId,
        session_id: toolSessionId,
        tool_id: testToolId as ToolId,
        purpose: "health check",
        requested_effect: "read_only",
        scopes: [],
        metadata: {},
      });

      if (!result.allowed) {
        throw new Error(`Tool gate denied: ${result.reason}`);
      }
    });

    // Test 8: Ledger Write
    await this.runCheck("Ledger Write", async () => {
      const ledger = this.server.getLedger();
      const testEvent = {
        event_type: "ToolCallCompleted" as const,
        tool_id: testToolId,
        ok: true,
        output: { test: true },
      };
      const result = await ledger.append(testEvent as any);
      if (!result || typeof result.index !== "number") {
        throw new Error("Failed to append to ledger");
      }
    });

    // Test 9: Ledger Read/Replay
    await this.runCheck("Ledger Read/Replay", async () => {
      const ledger = this.server.getLedger();
      const events: any[] = [];
      for await (const record of await ledger.replay({ from_index: 0 })) {
        events.push(record);
      }
      if (events.length === 0) {
        throw new Error("No events found in ledger");
      }
    });

    // Test 10: Session Cleanup
    await this.runCheck("Session Cleanup", async () => {
      this.server.endVoiceSession(sessionId);
      const session = this.server.getVoiceSession(sessionId);
      if (session !== undefined) {
        throw new Error("Session was not properly cleaned up");
      }
    });

    return this.results;
  }

  printReport(): void {
    console.log(`\n${BLUE}╔═══════════════════════════════════════════════════════════════╗${RESET}`);
    console.log(`${BLUE}║           HEALTH CHECK RESULTS                                ║${RESET}`);
    console.log(`${BLUE}╠═══════════════════════════════════════════════════════════════╣${RESET}`);

    const passed = this.results.filter((r) => r.passed);
    const failed = this.results.filter((r) => !r.passed);
    const totalDuration = Date.now() - this.startTime;

    for (const result of this.results) {
      const status = result.passed
        ? `${GREEN}✓ PASS${RESET}`
        : `${RED}✗ FAIL${RESET}`;
      const duration = `${result.duration}ms`.padStart(5);
      console.log(`${status} ${result.name.padEnd(30)} ${duration}`);
      if (result.error) {
        console.log(`  ${YELLOW}→ ${result.error}${RESET}`);
      }
    }

    console.log(`${BLUE}╠═══════════════════════════════════════════════════════════════╣${RESET}`);
    console.log(
      `${BLUE}║${RESET}  Total: ${passed.length} passed, ${failed.length} failed, ${this.results.length} total${RESET}`.padEnd(65) + `${BLUE}║${RESET}`
    );
    console.log(
      `${BLUE}║${RESET}  Duration: ${totalDuration}ms${RESET}`.padEnd(65) + `${BLUE}║${RESET}`
    );
    console.log(
      `${BLUE}║${RESET}  Status: ${failed.length === 0 ? `${GREEN}HEALTHY${RESET}` : `${RED}UNHEALTHY${RESET}`}${RESET}`.padEnd(65) + `${BLUE}║${RESET}`
    );
    console.log(`${BLUE}╚═══════════════════════════════════════════════════════════════╝${RESET}\n`);
  }

  getExitCode(): number {
    const failed = this.results.filter((r) => !r.passed);
    return failed.length > 0 ? 1 : 0;
  }
}

// Main execution
async function main() {
  const checker = new HealthChecker();

  try {
    await checker.initialize();
    await checker.runAllChecks();
    checker.printReport();
    process.exit(checker.getExitCode());
  } catch (error) {
    console.error(`${RED}Fatal error during health check:${RESET}`, error);
    process.exit(1);
  } finally {
    await checker.shutdown();
  }
}

// Run if executed directly
if (import.meta.main) {
  main();
}

export { HealthChecker, type HealthCheckResult };
