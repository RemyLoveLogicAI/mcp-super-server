/**
 * Ledger Hardening Tests
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createInMemoryLedger, createSupabaseLedger } from "../src/index";

const migrationPath = path.resolve(import.meta.dirname, "../migrations/001_create_tables.sql");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const runLive = Boolean(url && key);

describe("Ledger migration sanity", () => {
  it("contains the events and timelines tables", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("create table if not exists timelines");
    expect(sql).toContain("create table if not exists events");
    expect(sql).toContain("events_update_timeline_head");
  });
});

describe("In-memory ledger contract parity", () => {
  it("supports append/replay/fork/integrity", async () => {
    const ledger = createInMemoryLedger();
    const worldId = "11111111-1111-1111-1111-111111111111";
    const timelineId = "22222222-2222-2222-2222-222222222222";
    ledger.registerTimeline(timelineId, worldId);

    const first = await ledger.append({
      event_id: "33333333-3333-3333-3333-333333333333",
      event_type: "VoiceTurnStarted",
      timestamp: new Date().toISOString(),
      actor: { system: true },
      world_id: worldId,
      timeline_id: timelineId,
      turn_id: 0,
      channel: "web",
    } as any);

    expect(first.index).toBe(0);

    const replayed = await ledger.replay({ world_id: worldId, timeline_id: timelineId, from_index: 0 });
    expect(replayed).toHaveLength(1);
    expect(replayed[0]?.event.event_type).toBe("VoiceTurnStarted");

    const integrity = await ledger.verifyIntegrity(worldId, timelineId);
    expect(integrity.valid).toBe(true);
  });
});

describe.skipIf(!runLive)("Supabase ledger integration", () => {
  it("appends, replays, forks, and verifies against a real database", async () => {
    const ledger = createSupabaseLedger({ supabaseUrl: url!, supabaseServiceKey: key! });
    const worldId = crypto.randomUUID();
    const timelineId = crypto.randomUUID();

    const timeline = await (ledger as any).getTimeline(worldId, timelineId);
    expect(timeline).toBeNull();

    const setup = await fetch(`${url}/rest/v1/timelines`, {
      method: "POST",
      headers: {
        apikey: key!,
        Authorization: `Bearer ${key!}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        id: timelineId,
        world_id: worldId,
        name: "test",
        head_event_index: 0,
      }),
    });
    expect(setup.ok).toBe(true);

    const appended = await ledger.append({
      event_id: crypto.randomUUID(),
      event_type: "VoiceTurnStarted",
      timestamp: new Date().toISOString(),
      actor: { system: true },
      world_id: worldId,
      timeline_id: timelineId,
      turn_id: 1,
      channel: "web",
    } as any);

    expect(appended.index).toBeGreaterThanOrEqual(0);

    const replayed = await ledger.replay({ world_id: worldId, timeline_id: timelineId, from_index: 0 });
    expect(replayed.length).toBeGreaterThan(0);
    expect(replayed[0]?.event.event_type).toBe("VoiceTurnStarted");

    const fork = await ledger.fork({
      world_id: worldId,
      from_timeline_id: timelineId,
      fork_from_event_index: appended.index,
      new_timeline_name: "branch",
    });
    expect(fork.new_timeline_id).toBeDefined();

    const integrity = await ledger.verifyIntegrity(worldId, timelineId, 0);
    expect(integrity.valid).toBe(true);
  }, 30_000);
});
