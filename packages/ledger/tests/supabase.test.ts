/**
 * @mss/ledger - Supabase Ledger Tests
 * 
 * These tests require a Supabase instance. Set environment variables:
 *   SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_KEY - Supabase service role key
 * 
 * Or run with --skip-integration to skip these tests.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createSupabaseLedger, type SupabaseLedgerConfig } from "../src/supabase/index.js";
import type { CoreEvent } from "@mss/core/events";

// Skip tests if no Supabase credentials
const shouldRun = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);

const describeIf = shouldRun ? describe : describe.skip;

// ─────────────────────────────────────────────────────────────────────────────
// Test Configuration
// ─────────────────────────────────────────────────────────────────────────────

function getTestConfig(): SupabaseLedgerConfig {
  return {
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY!,
    debug: process.env.DEBUG === "true",
  };
}

function createTestEvent(overrides: Partial<CoreEvent> = {}): CoreEvent {
  return {
    event_id: crypto.randomUUID(),
    event_type: "TestEvent",
    timestamp: new Date().toISOString(),
    ...overrides,
  } as CoreEvent;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describeIf("SupabaseLedger", () => {
  let ledger: ReturnType<typeof createSupabaseLedger>;
  const testWorldId = crypto.randomUUID();
  const testTimelineId = crypto.randomUUID();

  beforeAll(async () => {
    ledger = createSupabaseLedger(getTestConfig());
    
    // Verify connection
    const health = await ledger.healthCheck();
    if (!health.healthy) {
      console.error("Supabase health check failed:", health.error);
      throw new Error("Cannot connect to Supabase");
    }
  });

  beforeEach(async () => {
    // Clear test data before each test
    try {
      await ledger._dangerousTruncate(testWorldId, testTimelineId);
    } catch {
      // Ignore if no data to delete
    }
  });

  afterAll(async () => {
    // Final cleanup
    try {
      await ledger._dangerousTruncate(testWorldId, testTimelineId);
    } catch {
      // Ignore
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Health Check
  // ───────────────────────────────────────────────────────────────────────────

  it("should pass health check", async () => {
    const result = await ledger.healthCheck();
    expect(result.healthy).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Append
  // ───────────────────────────────────────────────────────────────────────────

  it("should append an event and return result", async () => {
    const event = createTestEvent();
    const result = await ledger.append(event, testWorldId, testTimelineId);

    expect(result.event_id).toBe(event.event_id);
    expect(result.hash).toBeDefined();
    expect(result.index).toBe(0);
    expect(result.timestamp).toBeDefined();
  });

  it("should increment index for subsequent events", async () => {
    const event1 = createTestEvent();
    const event2 = createTestEvent();

    const result1 = await ledger.append(event1, testWorldId, testTimelineId);
    const result2 = await ledger.append(event2, testWorldId, testTimelineId);

    expect(result1.index).toBe(0);
    expect(result2.index).toBe(1);
  });

  it("should chain hashes for integrity", async () => {
    const event1 = createTestEvent();
    const event2 = createTestEvent();

    const result1 = await ledger.append(event1, testWorldId, testTimelineId);
    const result2 = await ledger.append(event2, testWorldId, testTimelineId);

    // Second event's prev_hash should match first event's hash
    const events = await ledger.replay({ world_id: testWorldId, timeline_id: testTimelineId });
    expect(events[1]?.event).toHaveProperty("prev_hash", result1.hash);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Replay
  // ───────────────────────────────────────────────────────────────────────────

  it("should replay events in order", async () => {
    for (let i = 0; i < 5; i++) {
      await ledger.append(createTestEvent({ event_type: `Event${i}` }), testWorldId, testTimelineId);
    }

    const events = await ledger.replay({ world_id: testWorldId, timeline_id: testTimelineId });

    expect(events).toHaveLength(5);
    expect(events[0]?.index).toBe(0);
    expect(events[4]?.index).toBe(4);
  });

  it("should filter by event type", async () => {
    await ledger.append(createTestEvent({ event_type: "TypeA" }), testWorldId, testTimelineId);
    await ledger.append(createTestEvent({ event_type: "TypeB" }), testWorldId, testTimelineId);
    await ledger.append(createTestEvent({ event_type: "TypeA" }), testWorldId, testTimelineId);

    const events = await ledger.replay({
      world_id: testWorldId,
      timeline_id: testTimelineId,
      event_types: ["TypeA"],
    });

    expect(events).toHaveLength(2);
    events.forEach((e) => expect(e.event.event_type).toBe("TypeA"));
  });

  it("should apply from_index filter", async () => {
    for (let i = 0; i < 5; i++) {
      await ledger.append(createTestEvent(), testWorldId, testTimelineId);
    }

    const events = await ledger.replay({
      world_id: testWorldId,
      timeline_id: testTimelineId,
      from_index: 2,
    });

    expect(events).toHaveLength(3);
    expect(events[0]?.index).toBe(2);
  });

  it("should apply limit", async () => {
    for (let i = 0; i < 10; i++) {
      await ledger.append(createTestEvent(), testWorldId, testTimelineId);
    }

    const events = await ledger.replay({
      world_id: testWorldId,
      timeline_id: testTimelineId,
      limit: 3,
    });

    expect(events).toHaveLength(3);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Get Head
  // ───────────────────────────────────────────────────────────────────────────

  it("should return head for timeline with events", async () => {
    for (let i = 0; i < 3; i++) {
      await ledger.append(createTestEvent(), testWorldId, testTimelineId);
    }

    const head = await ledger.getHead(testWorldId, testTimelineId);

    expect(head).not.toBeNull();
    expect(head?.index).toBe(2);
  });

  it("should return null for empty timeline", async () => {
    const head = await ledger.getHead(crypto.randomUUID(), crypto.randomUUID());
    expect(head).toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Verify Integrity
  // ───────────────────────────────────────────────────────────────────────────

  it("should verify integrity of valid chain", async () => {
    for (let i = 0; i < 5; i++) {
      await ledger.append(createTestEvent(), testWorldId, testTimelineId);
    }

    const result = await ledger.verifyIntegrity(testWorldId, testTimelineId);
    expect(result.valid).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Fork
  // ───────────────────────────────────────────────────────────────────────────

  it("should fork a timeline", async () => {
    // Create source events
    for (let i = 0; i < 5; i++) {
      await ledger.append(createTestEvent({ event_type: `Source${i}` }), testWorldId, testTimelineId);
    }

    // Fork at index 2
    const forkResult = await ledger.fork({
      world_id: testWorldId,
      from_timeline_id: testTimelineId,
      fork_from_event_index: 2,
    });

    expect(forkResult.new_timeline_id).toBeDefined();
    expect(forkResult.fork_point).toBe(2);

    // Verify fork has 3 events (0, 1, 2)
    const forkedEvents = await ledger.replay({
      world_id: testWorldId,
      timeline_id: forkResult.new_timeline_id,
    });

    expect(forkedEvents).toHaveLength(3);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Count
  // ───────────────────────────────────────────────────────────────────────────

  it("should count events", async () => {
    for (let i = 0; i < 5; i++) {
      await ledger.append(createTestEvent(), testWorldId, testTimelineId);
    }

    const count = await ledger.count(testWorldId, testTimelineId);
    expect(count).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Always-run smoke test (no external dependencies)
// ─────────────────────────────────────────────────────────────────────────────

describe("SupabaseLedger (unit)", () => {
  it("should export createSupabaseLedger function", () => {
    expect(typeof createSupabaseLedger).toBe("function");
  });

  it("should throw on empty config parameters", () => {
    // Supabase client requires valid URL
    expect(() => createSupabaseLedger({ supabaseUrl: "", supabaseServiceKey: "" })).toThrow();
  });
});