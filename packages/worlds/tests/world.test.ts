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
  });
});
