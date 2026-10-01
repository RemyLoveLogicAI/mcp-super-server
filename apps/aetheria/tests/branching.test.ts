import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { TimelineManager, WorldState, type WorldEvent } from "@mss/worlds";
import type { WorldEventAppended, TimelineForked } from "@mss/core/events/world";
import { createInMemoryLedger } from "@mss/ledger";
import { Arcade, MemoryApprovalStore, createLedgermonGame } from "@mss/games";
import { createOrchestrator } from "@mss/orchestrator";
import { ArcadeToolExecutor } from "../src/index.js";

describe("Aetheria Branching Timelines & World State", () => {
  const worldId = "test-aetheria-world";
  const familiarId = "familiar-alpha";

  it("produces distinct branch projections before merge", () => {
    const timelineManager = new TimelineManager();
    const main = timelineManager.createTimeline(worldId, "main");

    // Event 0: Create baseline familiar
    const entityCreatedEvent: WorldEvent = {
      id: randomUUID(),
      eventType: "entity_created",
      entityId: familiarId,
      payload: {
        id: familiarId,
        type: "familiar",
        state: { level: 1, xp: 0, hp: 100, maxHp: 100, strategy: "balanced" },
      },
      timestamp: new Date().toISOString(),
      actorId: "test-user",
    };
    timelineManager.appendEvent(worldId, entityCreatedEvent);

    // Event 1: Main timeline battle (balanced strategy, +50 XP)
    const mainBattleEvent: WorldEvent = {
      id: randomUUID(),
      eventType: "familiar_battled",
      entityId: familiarId,
      payload: {
        winner_did: `did:aetheria:${familiarId}`,
        xp_gained: 50,
        outcome: "victory",
        state: { xp: 50, battles_won: 1, strategy: "balanced" },
      },
      timestamp: new Date().toISOString(),
      actorId: "test-user",
    };
    timelineManager.appendEvent(worldId, mainBattleEvent);

    // Fork counterfactual branch right after creation (forkPoint = 1)
    const branch = timelineManager.forkTimeline(main.id, "counterfactual-strategy", 1);
    expect(branch.events).toHaveLength(1);
    expect(branch.events[0]!.id).toBe(entityCreatedEvent.id);

    // Event 1 on branch: Alternate scenario (aggressive strategy, +150 XP)
    const alternateBattleEvent: WorldEvent = {
      id: randomUUID(),
      eventType: "familiar_battled",
      entityId: familiarId,
      payload: {
        winner_did: `did:aetheria:${familiarId}`,
        xp_gained: 150,
        outcome: "critical_victory",
        strategy: "aggressive",
        state: { xp: 150, hp: 40, battles_won: 1, strategy: "aggressive" },
      },
      timestamp: new Date().toISOString(),
      actorId: "test-user",
    };
    timelineManager.appendEvent(worldId, alternateBattleEvent);

    // Rehydrate two separate WorldState instances from their respective timeline event streams
    const mainWorld = new WorldState(worldId, { worldType: "game" });
    mainWorld.rehydrate(main.events);

    const branchWorld = new WorldState(worldId, { worldType: "game" });
    branchWorld.rehydrate(branch.events);

    const mainFamiliar = mainWorld.getEntity(familiarId);
    const branchFamiliar = branchWorld.getEntity(familiarId);

    expect(mainFamiliar).toBeDefined();
    expect(branchFamiliar).toBeDefined();

    // Verify distinct projections
    expect(mainFamiliar!.state.xp).toBe(50);
    expect(branchFamiliar!.state.xp).toBe(150);
    expect(mainFamiliar!.state.strategy).toBe("balanced");
    expect(branchFamiliar!.state.strategy).toBe("aggressive");
    expect(mainFamiliar!.state.xp).not.toBe(branchFamiliar!.state.xp);
  });

  it("performs ancestry-safe merge of branch into main", () => {
    const timelineManager = new TimelineManager();
    const main = timelineManager.createTimeline(worldId, "main");

    const event0: WorldEvent = {
      id: randomUUID(),
      eventType: "entity_created",
      entityId: familiarId,
      payload: { id: familiarId, type: "familiar", state: { level: 1, xp: 0, hp: 100 } },
      timestamp: new Date().toISOString(),
    };
    timelineManager.appendEvent(worldId, event0);

    const event1: WorldEvent = {
      id: randomUUID(),
      eventType: "familiar_battled",
      entityId: familiarId,
      payload: { state: { xp: 50 } },
      timestamp: new Date().toISOString(),
    };
    timelineManager.appendEvent(worldId, event1);

    // Fork at index 1
    const branch = timelineManager.forkTimeline(main.id, "counterfactual", 1);

    const eventBranch: WorldEvent = {
      id: randomUUID(),
      eventType: "familiar_battled",
      entityId: familiarId,
      payload: { state: { xp: 150, strategy: "berserk" } },
      timestamp: new Date().toISOString(),
    };
    timelineManager.appendEvent(worldId, eventBranch);

    // Merge branch into main
    const merged = timelineManager.mergeTimeline(branch.id, main.id);

    expect(merged).toBeDefined();
    expect(merged!.id).toBe(main.id);
    expect(merged!.isHead).toBe(true);
    expect(branch.isHead).toBe(false);

    // Main should contain original events + divergent branch events
    expect(merged!.events).toHaveLength(3);
    expect(merged!.events[0]!.id).toBe(event0.id);
    expect(merged!.events[1]!.id).toBe(event1.id);
    expect(merged!.events[2]!.id).toBe(eventBranch.id);

    // Unrelated timeline with no common ancestry must throw
    const unrelatedTimeline = timelineManager.createTimeline(worldId, "unrelated");
    expect(() => timelineManager.mergeTimeline(unrelatedTimeline.id, main.id)).toThrow(
      /no common ancestry/i
    );
  });

  it("rehydrates a fresh instance proving 100% event-derived state", () => {
    const timelineManager = new TimelineManager();
    const main = timelineManager.createTimeline(worldId, "main");

    const events: WorldEvent[] = [
      {
        id: randomUUID(),
        eventType: "entity_created",
        entityId: familiarId,
        payload: { id: familiarId, type: "familiar", state: { level: 1, xp: 0, hp: 100 } },
        timestamp: new Date().toISOString(),
      },
      {
        id: randomUUID(),
        eventType: "familiar_battled",
        entityId: familiarId,
        payload: { state: { xp: 50, battles_won: 1 } },
        timestamp: new Date().toISOString(),
      },
      {
        id: randomUUID(),
        eventType: "entity_updated",
        entityId: familiarId,
        payload: { entityId: familiarId, state: { level: 2, maxHp: 120 } },
        timestamp: new Date().toISOString(),
      },
    ];

    for (const e of events) {
      timelineManager.appendEvent(worldId, e);
    }

    // Completely fresh WorldState instance (starts completely empty)
    const freshWorld = new WorldState(worldId, { worldType: "game" });
    expect(freshWorld.listEntities()).toHaveLength(0);

    // Rehydrate from event log
    freshWorld.rehydrate(main.events);

    // Verify 100% event-derived state
    const reconstructed = freshWorld.getEntity(familiarId);
    expect(reconstructed).toBeDefined();
    expect(reconstructed!.id).toBe(familiarId);
    expect(reconstructed!.type).toBe("familiar");
    expect(reconstructed!.state.level).toBe(2);
    expect(reconstructed!.state.xp).toBe(50);
    expect(reconstructed!.state.hp).toBe(100);
    expect(reconstructed!.state.maxHp).toBe(120);
    expect(reconstructed!.state.battles_won).toBe(1);

    // Verify event replay history
    const replayed = freshWorld.replayEvents();
    expect(replayed).toHaveLength(3);
    expect(replayed.map((e) => e.id)).toEqual(events.map((e) => e.id));
  });

  it("executes game mechanics via in-memory fixture and records to ledger", async () => {
    const arcade = new Arcade(new MemoryApprovalStore()).register(createLedgermonGame());
    const executor = new ArcadeToolExecutor(arcade, "test-user", "aetheria-test");
    const orchestrator = createOrchestrator(
      { agent_id: "test-agent", default_budget: { max_tool_calls: 5, max_time_ms: 10_000 } },
      executor
    );
    const ledger = createInMemoryLedger();

    // Plan with deterministic ledgermon:battle
    const plan = await orchestrator.createPlan("Battle test familiar", [
      {
        tool_id: "ledgermon:battle",
        input: {
          a_did: `did:aetheria:${familiarId}`,
          a: { spd: 80, sta: 50, acc: 90, tem: 20, app: 40 },
          b_did: "did:continuum:glitch-sprite",
          b: { spd: 60, sta: 40, acc: 70, tem: 50, app: 30 },
        },
      },
    ]);

    const result = await orchestrator.executePlan(plan);
    expect(result.status).toBe("completed");
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]!.status).toBe("completed");

    const battleOutput = result.steps[0]!.result as {
      data: { winner_did: string; xp_gained: number; deterministic_hash: string };
      text: string;
    };
    expect(battleOutput.data.winner_did).toBe(`did:aetheria:${familiarId}`);
    expect(battleOutput.data.xp_gained).toBe(250);

    // Record tool completion in ledger
    const appendResult = await ledger.append({
      event_id: randomUUID(),
      event_type: "ToolCallCompleted",
      timestamp: new Date().toISOString(),
      actor: { canonical_user_id: "test-user" },
      tool_call_id: `${plan.plan_id}:step-1`,
      ok: true,
      output: battleOutput,
      duration_ms: 15,
    });

    expect(appendResult.event_id).toBeDefined();
    expect(appendResult.hash).toBeDefined();
    expect(appendResult.index).toBe(0);
  });

  it("preserves timeline provenance and avoids double-recording shared ancestor events in ledger", async () => {
    const timelineManager = new TimelineManager();
    const main = timelineManager.createTimeline(worldId, "main");
    const ledger = createInMemoryLedger();

    // Ancestor event on main
    const event0: WorldEvent = {
      id: randomUUID(),
      eventType: "entity_created",
      entityId: familiarId,
      payload: { id: familiarId, type: "familiar", state: { level: 1, xp: 0, hp: 100 } },
      timestamp: new Date().toISOString(),
    };
    timelineManager.appendEvent(worldId, event0);

    // Main-local event
    const event1: WorldEvent = {
      id: randomUUID(),
      eventType: "familiar_battled",
      entityId: familiarId,
      payload: { state: { xp: 50 } },
      timestamp: new Date().toISOString(),
    };
    timelineManager.appendEvent(worldId, event1);

    // Fork branch at event index 1 (inherits event0 as shared ancestor)
    const atEventIndex = 1;
    const branch = timelineManager.forkTimeline(main.id, "counterfactual-test", atEventIndex);

    // Branch-local event
    const eventBranch: WorldEvent = {
      id: randomUUID(),
      eventType: "familiar_battled",
      entityId: familiarId,
      payload: { state: { xp: 150, strategy: "berserk" } },
      timestamp: new Date().toISOString(),
    };
    timelineManager.appendEvent(worldId, eventBranch);

    // Merge branch into main
    const merged = timelineManager.mergeTimeline(branch.id, main.id);
    expect(merged).toBeDefined();

    // Record to ledger preserving provenance
    // 1. Main events recorded under main.id
    for (const wEvent of [event0, event1]) {
      const record: WorldEventAppended = {
        event_id: wEvent.id,
        event_type: "WorldEventAppended",
        timestamp: wEvent.timestamp ?? new Date().toISOString(),
        actor: { canonical_user_id: "test-user" },
        world_id: worldId,
        timeline_id: main.id,
        world_event_type: wEvent.eventType,
        payload: wEvent.payload,
      };
      await ledger.append(record, worldId, main.id);
    }

    // 2. Fork provenance recorded
    const forkRecord: TimelineForked = {
      event_id: randomUUID(),
      event_type: "TimelineForked",
      timestamp: new Date().toISOString(),
      actor: { canonical_user_id: "test-user" },
      world_id: worldId,
      from_timeline_id: main.id,
      new_timeline_id: branch.id,
      fork_from_event_index: atEventIndex,
    };
    await ledger.append(forkRecord, worldId, branch.id);

    // 3. Branch-local event recorded under branch.id (event0 ancestor NOT double-recorded)
    const branchRecord: WorldEventAppended = {
      event_id: eventBranch.id,
      event_type: "WorldEventAppended",
      timestamp: eventBranch.timestamp ?? new Date().toISOString(),
      actor: { canonical_user_id: "test-user" },
      world_id: worldId,
      timeline_id: branch.id,
      world_event_type: eventBranch.eventType,
      payload: eventBranch.payload,
    };
    await ledger.append(branchRecord, worldId, branch.id);

    // 4. Merge provenance recorded under main.id
    const mergeRecord: WorldEventAppended = {
      event_id: randomUUID(),
      event_type: "WorldEventAppended",
      timestamp: new Date().toISOString(),
      actor: { canonical_user_id: "test-user" },
      world_id: worldId,
      timeline_id: main.id,
      world_event_type: "timeline_merged",
      payload: {
        merged_from_timeline_id: branch.id,
        target_timeline_id: main.id,
        divergent_event_ids: [eventBranch.id],
      },
    };
    await ledger.append(mergeRecord, worldId, main.id);

    // Verify ledger replay per timeline
    const mainReplay = await ledger.replay({ timeline_id: main.id });
    const mainEventIds = mainReplay.map((r) => r.event.event_id);
    expect(mainEventIds).toContain(event0.id);
    expect(mainEventIds).toContain(event1.id);
    expect(mainEventIds).toContain(mergeRecord.event_id);
    expect(mainEventIds).not.toContain(eventBranch.id); // Not directly filed under main.id

    const branchReplay = await ledger.replay({ timeline_id: branch.id });
    const branchEventIds = branchReplay.map((r) => r.event.event_id);
    expect(branchEventIds).toContain(eventBranch.id);
    expect(branchEventIds).toContain(forkRecord.event_id);
    expect(branchEventIds).not.toContain(event0.id); // Ancestor not duplicated

    // Integrity check
    const mainIntegrity = await ledger.verifyIntegrity(worldId, main.id);
    expect(mainIntegrity.valid).toBe(true);
    const branchIntegrity = await ledger.verifyIntegrity(worldId, branch.id);
    expect(branchIntegrity.valid).toBe(true);
    expect(ledger.count()).toBe(5);
  });
});
