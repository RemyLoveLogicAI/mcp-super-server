/**
 * MCP Super-Server Load Test Implementation
 * 
 * This module provides load testing functions for:
 * - Concurrent voice sessions
 * - Tool invocation bursts
 * - Ledger event throughput
 * 
 * Called by the Python load_test.py orchestrator
 */

import { MCPSuperServer, createServer } from "../apps/server/src/server";
import { createVoiceSession } from "../packages/voice/src/index";
import { createInMemoryLedger } from "../packages/ledger/src/index";
import { createToolGate } from "../packages/tools/src/index";
import type { ToolDescriptor } from "../packages/core/src/resources/tool";
import type { CoreEvent } from "../packages/core/src/events";

interface TestResult {
  test_name: string;
  concurrent_count: number;
  total_operations: number;
  successful_operations: number;
  failed_operations: number;
  total_duration_ms: number;
  avg_response_time_ms: number;
  min_response_time_ms: number;
  max_response_time_ms: number;
  operations_per_second: number;
  errors: string[];
}

interface ConcurrencyTestResult extends TestResult {
  sessions_created: number;
  events_processed: number;
}

interface ToolBurstResult extends TestResult {
  tool_calls_made: number;
  gate_decisions: { allow: number; deny: number; require_human: number };
}

interface LedgerThroughputResult extends TestResult {
  events_appended: number;
  replay_events_per_second: number;
}

// ============================================================================
// Test 1: Concurrent Voice Sessions
// ============================================================================

export async function testConcurrentVoiceSessions(
  sessionCount: number,
  eventsPerSession: number
): Promise<ConcurrencyTestResult> {
  const server = createServer({
    ledger: { type: "memory" },
    gate: { maxCallsPerSession: 1000, defaultApproval: "auto" },
    meta: { name: "load-test", version: "0.0.1", environment: "test" },
  });
  await server.start();

  const startTime = Date.now();
  const timings: number[] = [];
  const errors: string[] = [];
  let sessionsCreated = 0;
  let eventsProcessed = 0;

  try {
    // Create sessions concurrently
    const sessionPromises = Array.from({ length: sessionCount }, async (_, i) => {
      const sessionStart = Date.now();
      try {
        const identity = await server.resolveIdentity("discord", `user${i}`);
        const { sessionId } = server.createVoiceSession(identity.canonicalUserId, "discord");
        sessionsCreated++;

        // Process events for this session
        for (let j = 0; j < eventsPerSession; j++) {
          const eventStart = Date.now();
          try {
            if (j === 0) {
              await server.processVoiceEvent(sessionId, { type: "AUDIO_START" });
            } else if (j === eventsPerSession - 1) {
              await server.processVoiceEvent(sessionId, { type: "AUDIO_END" });
            } else {
              await server.processVoiceEvent(sessionId, { 
                type: "ASR_PARTIAL", 
                text: `message ${j}` 
              });
            }
            eventsProcessed++;
            timings.push(Date.now() - eventStart);
          } catch (e) {
            errors.push(`Session ${i} event ${j}: ${e}`);
          }
        }

        const sessionDuration = Date.now() - sessionStart;
        return { success: true, duration: sessionDuration };
      } catch (e) {
        errors.push(`Session ${i}: ${e}`);
        return { success: false, duration: Date.now() - sessionStart };
      }
    });

    const results = await Promise.all(sessionPromises);
    const totalDuration = Date.now() - startTime;

    const successfulOps = results.filter(r => r.success).length;
    const failedOps = results.filter(r => !r.success).length;

    const avgTiming = timings.length > 0 
      ? timings.reduce((a, b) => a + b, 0) / timings.length 
      : 0;

    return {
      test_name: "concurrent_voice_sessions",
      concurrent_count: sessionCount,
      total_operations: sessionCount * eventsPerSession,
      successful_operations: successfulOps * eventsPerSession,
      failed_operations: failedOps * eventsPerSession,
      total_duration_ms: totalDuration,
      avg_response_time_ms: Math.round(avgTiming * 100) / 100,
      min_response_time_ms: timings.length > 0 ? Math.min(...timings) : 0,
      max_response_time_ms: timings.length > 0 ? Math.max(...timings) : 0,
      operations_per_second: Math.round((sessionCount * eventsPerSession) / (totalDuration / 1000) * 100) / 100,
      sessions_created: sessionsCreated,
      events_processed: eventsProcessed,
      errors: errors.slice(0, 10), // Limit error output
    };
  } finally {
    await server.stop();
  }
}

// ============================================================================
// Test 2: Tool Invocation Burst
// ============================================================================

export async function testToolInvocationBurst(
  totalCalls: number,
  concurrency: number
): Promise<ToolBurstResult> {
  const server = createServer({
    ledger: { type: "memory" },
    gate: { maxCallsPerSession: 10000, defaultApproval: "auto" },
    gateMode: "permissive",
    meta: { name: "load-test", version: "0.0.1", environment: "test" },
  });
  await server.start();

  const identity = await server.resolveIdentity("discord", "burst-user");
  const { sessionId } = server.createVoiceSession(identity.canonicalUserId, "discord");

  const startTime = Date.now();
  const timings: number[] = [];
  const errors: string[] = [];
  const gateDecisions = { allow: 0, deny: 0, require_human: 0 };

  // Prepare batches
  const batchSize = Math.ceil(totalCalls / concurrency);
  const batches = Array.from({ length: concurrency }, (_, i) => 
    Array.from({ length: Math.min(batchSize, totalCalls - i * batchSize) }, (_, j) => i * batchSize + j)
  );

  try {
    const batchPromises = batches.map(async (batch, batchIndex) => {
      for (const callIndex of batch) {
        const callStart = Date.now();
        try {
          // Alternate between read and write tools
          const toolId = callIndex % 2 === 0 ? "read:file" : "write:file";
          const result = await server.invokeTool(sessionId, toolId, { 
            path: `/tmp/test${callIndex}.txt`,
            content: "test content"
          });
          
          gateDecisions[result.decision as keyof typeof gateDecisions]++;
          timings.push(Date.now() - callStart);
        } catch (e) {
          errors.push(`Call ${callIndex}: ${e}`);
          gateDecisions.deny++;
        }
      }
      return { batchIndex, completed: batch.length };
    });

    await Promise.all(batchPromises);
    const totalDuration = Date.now() - startTime;

    const avgTiming = timings.length > 0 
      ? timings.reduce((a, b) => a + b, 0) / timings.length 
      : 0;

    return {
      test_name: "tool_invocation_burst",
      concurrent_count: concurrency,
      total_operations: totalCalls,
      successful_operations: gateDecisions.allow,
      failed_operations: gateDecisions.deny + errors.length,
      total_duration_ms: totalDuration,
      avg_response_time_ms: Math.round(avgTiming * 100) / 100,
      min_response_time_ms: timings.length > 0 ? Math.min(...timings) : 0,
      max_response_time_ms: timings.length > 0 ? Math.max(...timings) : 0,
      operations_per_second: Math.round(totalCalls / (totalDuration / 1000) * 100) / 100,
      tool_calls_made: totalCalls - errors.length,
      gate_decisions: gateDecisions,
      errors: errors.slice(0, 10),
    };
  } finally {
    await server.stop();
  }
}

// ============================================================================
// Test 3: Ledger Event Throughput
// ============================================================================

export async function testLedgerThroughput(
  eventCount: number,
  batchSize: number
): Promise<LedgerThroughputResult> {
  const ledger = createInMemoryLedger();
  const worldId = "test-world";
  const timelineId = "test-timeline";

  // Register timeline
  (ledger as any).registerTimeline?.(timelineId, worldId);

  const events: CoreEvent[] = Array.from({ length: eventCount }, (_, i) => ({
    event_id: crypto.randomUUID(),
    event_type: "ToolCallCompleted",
    timestamp: new Date().toISOString(),
    actor: { type: "agent", agent_id: "test-agent" },
    tool_id: `tool-${i}`,
    ok: true,
    world_id: worldId,
    timeline_id: timelineId,
  } as CoreEvent));

  // Test append throughput
  const appendStart = Date.now();
  const appendTimings: number[] = [];
  const errors: string[] = [];

  const batches = Array.from({ length: Math.ceil(eventCount / batchSize) }, (_, i) => 
    events.slice(i * batchSize, (i + 1) * batchSize)
  );

  for (const batch of batches) {
    const batchStart = Date.now();
    try {
      await Promise.all(batch.map(event => 
        ledger.append(event, worldId, timelineId)
      ));
      appendTimings.push(Date.now() - batchStart);
    } catch (e) {
      errors.push(`Batch: ${e}`);
    }
  }

  const appendDuration = Date.now() - appendStart;

  // Test replay throughput
  const replayStart = Date.now();
  const replayed = await ledger.replay({ 
    from_index: 0, 
    world_id: worldId, 
    timeline_id: timelineId 
  });
  const replayDuration = Date.now() - replayStart;

  const avgAppendTiming = appendTimings.length > 0 
    ? appendTimings.reduce((a, b) => a + b, 0) / appendTimings.length 
    : 0;

  return {
    test_name: "ledger_event_throughput",
    concurrent_count: batchSize,
    total_operations: eventCount,
    successful_operations: eventCount - errors.length,
    failed_operations: errors.length,
    total_duration_ms: appendDuration + replayDuration,
    avg_response_time_ms: Math.round(avgAppendTiming * 100) / 100,
    min_response_time_ms: appendTimings.length > 0 ? Math.min(...appendTimings) : 0,
    max_response_time_ms: appendTimings.length > 0 ? Math.max(...appendTimings) : 0,
    operations_per_second: Math.round(eventCount / (appendDuration / 1000) * 100) / 100,
    events_appended: eventCount - errors.length,
    replay_events_per_second: Math.round(replayed.length / (replayDuration / 1000) * 100) / 100,
    errors: errors.slice(0, 10),
  };
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  const testType = process.argv[2];
  const config = JSON.parse(process.argv[3] || '{}');

  let result: TestResult;

  switch (testType) {
    case 'voice_sessions':
      result = await testConcurrentVoiceSessions(
        config.session_count || 10,
        config.events_per_session || 5
      );
      break;
    case 'tool_burst':
      result = await testToolInvocationBurst(
        config.total_calls || 100,
        config.concurrency || 10
      );
      break;
    case 'ledger_throughput':
      result = await testLedgerThroughput(
        config.event_count || 1000,
        config.batch_size || 100
      );
      break;
    default:
      console.error(`Unknown test type: ${testType}`);
      process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.main) {
  main().catch(console.error);
}
