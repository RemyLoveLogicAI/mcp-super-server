/**
 * World Runtime Tests
 */

import { describe, it, expect } from "vitest";
import { WorldState } from "../src/index";
import { TimelineManager } from "../src/timeline";

describe("World State", () => {
  it("should create and manage entities", () => {
    const world = new WorldState("world-1", { worldType: "game" });
    const player = world.createEntity("player", { name: "Hero", health: 100 });
    expect(player.type).toBe("player");
    expect(player.state.name).toBe("Hero");

    world.updateEntity(player.id, { state: { name: "Hero", health: 75 } });
    const updated = world.getEntity(player.id);
    expect(updated?.state.health).toBe(75);
  });

  it("should log and replay events", () => {
    const world = new WorldState("world-1", { worldType: "game" });
    world.createEntity("npc", { role: "merchant" });
    const first = world.listEntities()[0];
    world.updateEntity(first.id, { state: { role: "merchant", gold: 100 } });

    const events = world.replayEvents();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].eventType).toBe("entity_created");
  });

  it("should snapshot and restore", () => {
    const world = new WorldState("world-1", { worldType: "game" });
    world.createEntity("item", { name: "Sword", damage: 10 });

    const snapshot = world.snapshot();
    expect(snapshot.entities.length).toBe(1);
    expect(snapshot.eventCount).toBe(1);

    world.createEntity("item", { name: "Shield", defense: 5 });
    expect(world.listEntities().length).toBe(2);

    world.restore(snapshot);
    expect(world.listEntities().length).toBe(1);
    expect(world.listEntities()[0]?.state.name).toBe("Sword");
  });

  it("should rehydrate state from event log from scratch", () => {
    const world = new WorldState("world-1", { worldType: "game" });
    const hero = world.createEntity("hero", { name: "Alice", hp: 100 });
    world.updateEntity(hero.id, {
      state: { hp: 80 },
      position: { x: 10, y: 20, z: 0 }
    });
    const monster = world.createEntity("monster", { type: "goblin" });
    world.deleteEntity(monster.id);

    const events = world.replayEvents();
    expect(events.length).toBe(4);

    const freshWorld = new WorldState("world-1", { worldType: "game" });
    freshWorld.rehydrate(events);

    expect(freshWorld.listEntities().length).toBe(1);
    const rehydratedHero = freshWorld.getEntity(hero.id);
    expect(rehydratedHero).toBeDefined();
    expect(rehydratedHero?.state.hp).toBe(80);
    expect(rehydratedHero?.position).toEqual({ x: 10, y: 20, z: 0 });
    expect(freshWorld.getEntity(monster.id)).toBeUndefined();
  });

  it("should handle custom events with and without entityId", () => {
    const world = new WorldState("world-1", { worldType: "game" });
    const hero = world.createEntity("hero", { name: "Bob" });

    world.logEvent("level_up", hero.id, { level: 2 });
    expect(world.getEntity(hero.id)?.state.level).toBe(2);

    world.logEvent("weather_change", undefined, { weather: "rain" });
    expect(world.getCustomState().weather).toBe("rain");
  });

  it("prevents mutation bypass via entity references", () => {
    const world = new WorldState("world-1", { worldType: "game" });
    const entity = world.createEntity("player", {
      name: "Alice",
      position: { x: 10, y: 20 }
    });

    const retrieved = world.getEntity(entity.id);
    expect(retrieved).toBeDefined();
    retrieved!.state.name = "hacked";
    if (retrieved!.position) {
      retrieved!.position.x = 999;
    }

    const reRetrieved = world.getEntity(entity.id);
    expect(reRetrieved?.state.name).toBe("Alice");
    expect(reRetrieved?.position?.x).toBe(10);

    const listed = world.listEntities()[0];
    expect(listed).toBeDefined();
    listed!.state.name = "hacked_via_list";

    expect(world.getEntity(entity.id)?.state.name).toBe("Alice");
  });

  it("validates snapshot worldId on restore", () => {
    const world1 = new WorldState("world-1", { worldType: "game" });
    const world2 = new WorldState("world-2", { worldType: "game" });
    world2.createEntity("item", { name: "Potion" });
    const snapshot2 = world2.snapshot();

    expect(() => world1.restore(snapshot2)).toThrow(
      "Cannot restore snapshot for world world-2 into world world-1"
    );
  });

  it("restores fresh instance from snapshot with matching replayEvents and listEntities", () => {
    const source = new WorldState("world-1", { worldType: "game" });
    const hero = source.createEntity("hero", { name: "Alice", hp: 100 });
    source.updateEntity(hero.id, { state: { hp: 90 }, position: { x: 5, y: 15 } });
    const sword = source.createEntity("weapon", { name: "Excalibur", damage: 50 });
    source.deleteEntity(sword.id);
    source.logEvent("ambient_sound", undefined, { sound: "wind" });

    const snapshot = source.snapshot();

    const fresh = new WorldState("world-1", { worldType: "game" });
    fresh.restore(snapshot);

    expect(fresh.listEntities()).toEqual(source.listEntities());
    expect(fresh.replayEvents()).toEqual(source.replayEvents());
    expect(fresh.getCustomState()).toEqual(source.getCustomState());
  });

  it("public applyEvent records event in replayEvents", () => {
    const world = new WorldState("world-1", { worldType: "game" });
    const customEvent = {
      id: "drone-event-1",
      eventType: "entity_created",
      entityId: "ext-1",
      payload: { type: "drone", state: { battery: 100 } },
      timestamp: "2026-01-01T00:00:00.000Z"
    };
    world.applyEvent(customEvent);

    expect(world.getEntity("ext-1")?.state.battery).toBe(100);
    expect(world.replayEvents().length).toBe(1);
    expect(world.replayEvents()[0]).toEqual(customEvent);
  });
});

describe("Timeline Branching", () => {
  it("should create and fork timelines", () => {
    const manager = new TimelineManager();
    const main = manager.createTimeline("world-1", "main");
    expect(main.name).toBe("main");
    expect(main.isHead).toBe(true);

    manager.appendEvent("world-1", { eventType: "test", payload: {} });

    const branch = manager.forkTimeline(main.id, "branch", 0);
    expect(branch.name).toBe("branch");
    expect(branch.forkFromTimelineId).toBe(main.id);
    expect(branch.events.length).toBe(0);
  });

  it("should merge timelines", () => {
    const manager = new TimelineManager();
    const main = manager.createTimeline("world-1", "main");
    manager.appendEvent("world-1", { eventType: "e1", payload: {} });

    const branch = manager.forkTimeline(main.id, "branch", 1);
    manager.appendEvent("world-1", { eventType: "e2", payload: {} });

    const merged = manager.mergeTimeline(branch.id, main.id);
    expect(merged?.events.length).toBe(2);
    expect(branch.isHead).toBe(false);
  });

  it("should enforce fork bounds", () => {
    const manager = new TimelineManager();
    const main = manager.createTimeline("world-1", "main");
    manager.appendEvent("world-1", { eventType: "e1", payload: {} });

    expect(() => manager.forkTimeline(main.id, "b1", -1)).toThrow(/out of bounds/);
    expect(() => manager.forkTimeline(main.id, "b2", 2)).toThrow(/out of bounds/);
    expect(() => manager.forkTimeline(main.id, "b3", 0)).not.toThrow();
    expect(() => manager.forkTimeline(main.id, "b4", 1)).not.toThrow();
  });

  it("should enforce world isolation when merging", () => {
    const manager = new TimelineManager();
    const t1 = manager.createTimeline("world-1", "t1");
    const t2 = manager.createTimeline("world-2", "t2");

    expect(() => manager.mergeTimeline(t1.id, t2.id)).toThrow(
      "Cannot merge timelines across different worlds"
    );
  });

  it("should not drop divergent events when target is longer than source", () => {
    const manager = new TimelineManager();
    const main = manager.createTimeline("world-1", "main");
    manager.appendEvent("world-1", { eventType: "m1", payload: {} });

    // Fork branch at event 1 (branch has [m1])
    const branch = manager.forkTimeline(main.id, "branch", 1);

    // Add divergent event on branch
    manager.appendEvent("world-1", { eventType: "b_extra", payload: {} });

    // Switch head back or add multiple events to main so main is much longer than branch
    main.events.push(
      { eventType: "m2", payload: {}, timestamp: new Date().toISOString() },
      { eventType: "m3", payload: {}, timestamp: new Date().toISOString() },
      { eventType: "m4", payload: {}, timestamp: new Date().toISOString() }
    );
    // main now has 4 events: m1, m2, m3, m4.
    // branch has 2 events: m1, b_extra.
    // target (main) is longer than source (branch).
    // In the old buggy code, source.events.slice(target.events.length) -> slice(4) returned empty, dropping b_extra!

    const merged = manager.mergeTimeline(branch.id, main.id);
    expect(merged?.events.length).toBe(5);
    expect(merged?.events.map(e => e.eventType)).toEqual(["m1", "m2", "m3", "m4", "b_extra"]);
    expect(branch.isHead).toBe(false);
  });
});

describe("direct-create validation", () => {
  it("rejects nonexistent parent", () => {
    const manager = new TimelineManager();
    expect(() => manager.createTimeline("world-1", "branch", "missing-id")).toThrow(
      "Parent timeline missing-id not found"
    );
  });

  it("rejects cross-world parent", () => {
    const manager = new TimelineManager();
    const parent = manager.createTimeline("world-1", "parent");
    expect(() => manager.createTimeline("world-2", "child", parent.id)).toThrow(
      "Parent timeline belongs to world world-1, not world-2"
    );
  });

  it("rejects negative forkPoint", () => {
    const manager = new TimelineManager();
    const parent = manager.createTimeline("world-1", "parent");
    expect(() => manager.createTimeline("world-1", "child", parent.id, -1)).toThrow(
      "forkPoint -1 out of bounds [0, 0]"
    );
  });

  it("rejects out-of-bounds forkPoint", () => {
    const manager = new TimelineManager();
    const parent = manager.createTimeline("world-1", "parent");
    manager.appendEvent("world-1", { eventType: "e1", payload: {} });
    expect(() => manager.createTimeline("world-1", "child", parent.id, 5)).toThrow(
      "forkPoint 5 out of bounds [0, 1]"
    );
  });
});

describe("self-merge", () => {
  it("rejects merging timeline into itself", () => {
    const manager = new TimelineManager();
    const main = manager.createTimeline("world-1", "main");
    expect(() => manager.mergeTimeline(main.id, main.id)).toThrow(
      `Cannot merge timeline into itself: ${main.id}`
    );
  });
});

describe("unrelated-root", () => {
  it("rejects merging two separate root timelines that share no ancestor", () => {
    const manager = new TimelineManager();
    const root1 = manager.createTimeline("world-1", "root1");
    const root2 = manager.createTimeline("world-1", "root2");
    expect(() => manager.mergeTimeline(root1.id, root2.id)).toThrow(
      `Cannot merge timelines with no common ancestry: ${root1.id} and ${root2.id}`
    );
  });
});

describe("sibling-different-fork", () => {
  it("merges sibling branches at different fork points without duplicating parent events", () => {
    const manager = new TimelineManager();
    const parent = manager.createTimeline("world-1", "parent");
    manager.appendEvent("world-1", { eventType: "e0", payload: {} });
    manager.appendEvent("world-1", { eventType: "e1", payload: {} });

    // branch1 forked at forkPoint 1 -> has [e0]
    const branch1 = manager.forkTimeline(parent.id, "b1", 1);
    manager.appendEvent("world-1", { eventType: "b1_event", payload: {} });

    // branch2 forked at forkPoint 2 -> has [e0, e1]
    const branch2 = manager.forkTimeline(parent.id, "b2", 2);
    manager.appendEvent("world-1", { eventType: "b2_event", payload: {} });

    // Merge branch1 into branch2
    const merged = manager.mergeTimeline(branch1.id, branch2.id);
    expect(merged).toBeDefined();

    const e0Count = merged!.events.filter(e => e.eventType === "e0").length;
    const e1Count = merged!.events.filter(e => e.eventType === "e1").length;
    expect(e0Count).toBe(1);
    expect(e1Count).toBe(1);
    expect(merged!.events.map(e => e.eventType)).toEqual(["e0", "e1", "b2_event", "b1_event"]);
    expect(branch1.isHead).toBe(false);
  });
});

describe("merge-then-append", () => {
  it("switches head to target on merge and appends subsequent events to target", () => {
    const manager = new TimelineManager();
    const main = manager.createTimeline("world-1", "main");
    manager.appendEvent("world-1", { eventType: "m1", payload: {} });

    const branch = manager.forkTimeline(main.id, "branch", 1);
    manager.appendEvent("world-1", { eventType: "b1", payload: {} });

    // branch is active head before merge
    expect(branch.isHead).toBe(true);
    expect(main.isHead).toBe(false);

    // Merge branch into main
    manager.mergeTimeline(branch.id, main.id);

    expect(manager.getHead("world-1")?.id).toBe(main.id);
    expect(main.isHead).toBe(true);
    expect(branch.isHead).toBe(false);

    manager.appendEvent("world-1", { eventType: "m2", payload: {} });

    expect(main.events.map(e => e.eventType)).toContain("m2");
    expect(branch.events.map(e => e.eventType)).not.toContain("m2");
  });
});

describe("structural-event-deduplication", () => {
  it("deduplicates deserialized/reconstructed events during merge", () => {
    const manager = new TimelineManager();
    const parent = manager.createTimeline("world-1", "parent");
    manager.appendEvent("world-1", { eventType: "e0", payload: { step: 0 } });
    manager.appendEvent("world-1", { eventType: "e1", payload: { step: 1 } });

    // Fork branch1 at 1, branch2 at 2
    const branch1 = manager.forkTimeline(parent.id, "b1", 1);
    manager.appendEvent("world-1", { eventType: "b1_event", payload: {} });

    const branch2 = manager.forkTimeline(parent.id, "b2", 2);
    manager.appendEvent("world-1", { eventType: "b2_event", payload: {} });

    // Deserialize events in branch1 so they have completely new object references
    branch1.events = JSON.parse(JSON.stringify(branch1.events));
    branch2.events = JSON.parse(JSON.stringify(branch2.events));

    const merged = manager.mergeTimeline(branch1.id, branch2.id);
    expect(merged).toBeDefined();

    // Verify parent events e0 and e1 are not duplicated despite different references
    const e0Events = merged!.events.filter(e => e.eventType === "e0");
    const e1Events = merged!.events.filter(e => e.eventType === "e1");
    expect(e0Events.length).toBe(1);
    expect(e1Events.length).toBe(1);
    expect(merged!.events.map(e => e.eventType)).toEqual(["e0", "e1", "b2_event", "b1_event"]);
  });
});

describe("event-identity-deduplication", () => {
  it("allows two legitimate repeated actions with identical type, payload, and timestamp but different ids to both survive after merge", () => {
    const manager = new TimelineManager();
    const parent = manager.createTimeline("world-1", "parent");
    const fixedTimestamp = "2026-01-01T12:00:00.000Z";

    // Branch 1 has action 1
    const branch1 = manager.forkTimeline(parent.id, "b1", 0);
    manager.appendEvent("world-1", {
      id: "action-1",
      eventType: "player_move",
      payload: { direction: "north", steps: 1 },
      timestamp: fixedTimestamp
    });

    // Branch 2 has action 2 (identical eventType, payload, and timestamp, but different id)
    const branch2 = manager.forkTimeline(parent.id, "b2", 0);
    manager.appendEvent("world-1", {
      id: "action-2",
      eventType: "player_move",
      payload: { direction: "north", steps: 1 },
      timestamp: fixedTimestamp
    });

    const merged = manager.mergeTimeline(branch1.id, branch2.id);
    expect(merged).toBeDefined();

    const moveEvents = merged!.events.filter(e => e.eventType === "player_move");
    expect(moveEvents.length).toBe(2);
    expect(moveEvents.map(e => e.id)).toEqual(["action-2", "action-1"]);
  });

  it("asserts event id is preserved through fork, snapshot, restore, and rehydrate", () => {
    const world = new WorldState("world-1", { worldType: "game" });
    const eventId = "custom-uuid-123";
    world.applyEvent({
      id: eventId,
      eventType: "item_spawned",
      payload: { itemId: "gem" },
      timestamp: "2026-01-01T00:00:00.000Z"
    });

    // Verify replayEvents preserves id
    expect(world.replayEvents()[0]?.id).toBe(eventId);

    // Snapshot & Restore preserves id
    const snapshot = world.snapshot();
    expect(snapshot.events[0]?.id).toBe(eventId);

    const restoredWorld = new WorldState("world-1", { worldType: "game" });
    restoredWorld.restore(snapshot);
    expect(restoredWorld.replayEvents()[0]?.id).toBe(eventId);

    // Rehydrate preserves id
    const rehydratedWorld = new WorldState("world-1", { worldType: "game" });
    rehydratedWorld.rehydrate(snapshot.events);
    expect(rehydratedWorld.replayEvents()[0]?.id).toBe(eventId);

    // Fork preserves id in timeline
    const manager = new TimelineManager();
    const main = manager.createTimeline("world-1", "main");
    manager.appendEvent("world-1", {
      id: "tl-event-1",
      eventType: "world_tick",
      payload: {}
    });
    const fork = manager.forkTimeline(main.id, "fork-1", 1);
    expect(fork.events[0]?.id).toBe("tl-event-1");
  });
});

describe("event-sourced-integrity", () => {
  it("rejects duplicate event IDs in applyEvent", () => {
    const world = new WorldState("world-1", { worldType: "game" });
    const event = {
      id: "dup-event-1",
      eventType: "test_event",
      payload: {},
      timestamp: "2026-01-01T00:00:00.000Z"
    };
    world.applyEvent(event);
    expect(() => world.applyEvent(event)).toThrow("Duplicate event ID: dup-event-1");
  });

  it("rejects duplicate event IDs in rehydrate", () => {
    const world = new WorldState("world-1", { worldType: "game" });
    const events = [
      {
        id: "dup-hist-1",
        eventType: "e1",
        payload: {},
        timestamp: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "dup-hist-1",
        eventType: "e2",
        payload: {},
        timestamp: "2026-01-01T00:00:01.000Z"
      }
    ];
    expect(() => world.rehydrate(events)).toThrow(
      "Duplicate event ID in event history: dup-hist-1"
    );
  });

  it("rejects duplicate event IDs in appendEvent", () => {
    const manager = new TimelineManager();
    const main = manager.createTimeline("world-1", "main");
    manager.appendEvent("world-1", { id: "tl-dup-1", eventType: "e1", payload: {} });
    expect(() =>
      manager.appendEvent("world-1", { id: "tl-dup-1", eventType: "e2", payload: {} })
    ).toThrow(`Duplicate event ID: tl-dup-1 in timeline ${main.id}`);
  });

  it("derives restore state from snapshot.events and rejects eventCount mismatch", () => {
    const source = new WorldState("world-1", { worldType: "game" });
    const hero = source.createEntity("hero", { name: "TrueHero", hp: 100 });
    const snapshot = source.snapshot();

    // Rejects eventCount mismatch
    const badCountSnapshot = {
      ...snapshot,
      eventCount: snapshot.eventCount + 1
    };
    const target1 = new WorldState("world-1", { worldType: "game" });
    expect(() => target1.restore(badCountSnapshot)).toThrow(
      /Snapshot eventCount mismatch/
    );

    // Ignores tampered snapshot.entities and derives true state from snapshot.events
    const tamperedSnapshot = {
      ...snapshot,
      entities: [
        {
          id: hero.id,
          type: "hero",
          state: { name: "TamperedFakeHero", hp: 9999 },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]
    };
    const target2 = new WorldState("world-1", { worldType: "game" });
    target2.restore(tamperedSnapshot);

    const restoredHero = target2.getEntity(hero.id);
    expect(restoredHero?.state.name).toBe("TrueHero");
    expect(restoredHero?.state.hp).toBe(100);
  });

  it("failure-preserves-old-state: rehydrate failure preserves pre-existing state atomically", () => {
    const world = new WorldState("world-1", { worldType: "game" });
    const hero = world.createEntity("hero", { name: "OriginalHero", level: 10 });
    world.logEvent("ambient_track", undefined, { track: "forest_bgm" });

    const originalEntities = world.listEntities();
    const originalCustom = world.getCustomState();
    const originalEvents = world.replayEvents();

    const invalidEvents = [
      {
        id: "evt-valid-1",
        eventType: "entity_created",
        payload: { type: "npc", state: { name: "Merchant" } },
        timestamp: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "evt-valid-1", // duplicate ID will trigger Error
        eventType: "entity_created",
        payload: { type: "npc", state: { name: "DuplicateMerchant" } },
        timestamp: "2026-01-01T00:00:01.000Z"
      }
    ];

    expect(() => world.rehydrate(invalidEvents)).toThrow("Duplicate event ID in event history: evt-valid-1");

    // Pre-existing state must remain 100% untouched
    expect(world.listEntities()).toEqual(originalEntities);
    expect(world.getEntity(hero.id)?.state.name).toBe("OriginalHero");
    expect(world.getCustomState()).toEqual(originalCustom);
    expect(world.replayEvents()).toEqual(originalEvents);
  });

  it("tamper-resistance in restore: injected arbitrary customState in snapshot is ignored", () => {
    const source = new WorldState("world-1", { worldType: "game" });
    source.createEntity("item", { name: "Potion" });
    const snapshot = source.snapshot();

    // Tamper with snapshot.customState
    const tamperedSnapshot = {
      ...snapshot,
      customState: {
        ...snapshot.customState,
        hacked: true
      }
    };

    const world = new WorldState("world-1", { worldType: "game" });
    world.restore(tamperedSnapshot);

    expect(world.getCustomState()["hacked"]).toBeUndefined();
  });
});
