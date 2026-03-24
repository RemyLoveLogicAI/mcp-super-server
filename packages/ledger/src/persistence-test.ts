/**
 * Persistence Validation Suite
 * Validates Supabase ledger with real database
 *
 * Run: SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=yyy npx tsx src/persistence-test.ts
 */

import { createSupabaseLedger, SupabaseLedger } from "./supabase.js";
import type { CoreEvent } from "@mss/core/events";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

async function runTest(name: string, fn: () => Promise<void>): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, passed: true, duration: Date.now() - start };
  } catch (error) {
    return { name, passed: false, error: String(error), duration: Date.now() - start };
  }
}

async function validatePersistence(): Promise<TestResult[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.log("⚠️  Skipping persistence tests (no Supabase credentials)");
    return [];
  }

  console.log("🔄 Connecting to Supabase...");
  const ledger = createSupabaseLedger({ supabaseUrl: url, supabaseServiceKey: key });
  const results: TestResult[] = [];

  // Test 1: Basic append and replay
  results.push(await runTest("append_and_replay", async () => {
    const worldId = crypto.randomUUID();
    const timelineId = crypto.randomUUID();

    await (ledger as unknown as { ensureTimeline(t: { id: string; world_id: string; name: string }): Promise<void> })
      .ensureTimeline({ id: timelineId, world_id: worldId, name: "test-timeline" });

    const event1 = {
      event_type: "VoiceTurnStarted",
      timestamp: new Date().toISOString(),
      actor: { system: true },
      world_id: worldId,
      timeline_id: timelineId,
      turn_id: 0,
      channel: "web",
    } as unknown as CoreEvent;

    const result1 = await ledger.append(event1);
    if (result1.index !== 0) throw new Error(`Expected index 0, got ${result1.index}`);

    const replayed = await ledger.replay({ world_id: worldId, timeline_id: timelineId });
    if (replayed.length !== 1) throw new Error(`Expected 1 event, got ${replayed.length}`);
  }));

  // Test 2: Hash chain integrity
  results.push(await runTest("hash_chain_integrity", async () => {
    const worldId = crypto.randomUUID();
    const timelineId = crypto.randomUUID();

    await (ledger as unknown as { ensureTimeline(t: { id: string; world_id: string; name: string }): Promise<void> })
      .ensureTimeline({ id: timelineId, world_id: worldId, name: "integrity-test" });

    // Append multiple events
    for (let i = 0; i < 3; i++) {
      await ledger.append({
        event_type: "VoiceTurnStarted",
        timestamp: new Date().toISOString(),
        actor: { system: true },
        world_id: worldId,
        timeline_id: timelineId,
        turn_id: i,
        channel: "web",
      } as unknown as CoreEvent);
    }

    const integrity = await ledger.verifyIntegrity!(worldId, timelineId);
    if (!integrity.valid) throw new Error("Hash chain integrity check failed");
  }));

  // Test 3: Timeline branching
  results.push(await runTest("timeline_fork", async () => {
    const worldId = crypto.randomUUID();
    const timelineId = crypto.randomUUID();

    await (ledger as unknown as { ensureTimeline(t: { id: string; world_id: string; name: string }): Promise<void> })
      .ensureTimeline({ id: timelineId, world_id: worldId, name: "fork-test" });

    // Add events to main timeline
    for (let i = 0; i < 5; i++) {
      await ledger.append({
        event_type: "VoiceTurnStarted",
        timestamp: new Date().toISOString(),
        actor: { system: true },
        world_id: worldId,
        timeline_id: timelineId,
        turn_id: i,
        channel: "web",
      } as unknown as CoreEvent);
    }

    // Fork at event index 2
    const forkResult = await ledger.fork({
      world_id: worldId,
      from_timeline_id: timelineId,
      fork_from_event_index: 2,
      new_timeline_name: "branch-v2",
    });

    if (!forkResult.new_timeline_id) throw new Error("Fork failed to create new timeline");

    // Verify fork has copies of events before fork point
    const branchEvents = await ledger.replay({
      world_id: worldId,
      timeline_id: forkResult.new_timeline_id,
    });

    if (branchEvents.length !== 2) {
      throw new Error(`Expected 2 events in branch, got ${branchEvents.length}`);
    }
  }));

  return results;
}

// CLI entry point
if (import.meta.main) {
  console.log("🧪 Persistence Validation Suite");
  console.log("================================\n");

  const results = await validatePersistence();

  if (results.length === 0) {
    console.log("\n⚠️  No Supabase credentials - tests skipped");
    console.log("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to run persistence tests");
    process.exit(0);
  }

  console.log("\n📊 Results:");
  console.log("----------");

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    const icon = result.passed ? "✅" : "❌";
    console.log(`${icon} ${result.name}: ${result.passed ? "PASS" : "FAIL"} (${result.duration}ms)`);
    if (!result.passed && result.error) {
      console.log(`   Error: ${result.error}`);
    }
    if (result.passed) passed++;
    else failed++;
  }

  console.log("\n----------");
  console.log(`Total: ${results.length} | ✅ ${passed} passed | ❌ ${failed} failed`);

  process.exit(failed > 0 ? 1 : 0);
}

export { validatePersistence };
