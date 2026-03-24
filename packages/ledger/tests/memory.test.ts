/**
 * @mss/ledger - Unit Tests
 * Tests for InMemoryLedger implementation
 */

import { describe, it, beforeEach, expect } from "vitest";
import { InMemoryLedger, createInMemoryLedger } from "../src/memory";
import {
  generateWorldId,
  generateTimelineId,
  generateEventId,
  createVoiceTurnStarted,
  createToolCallRequested,
  createWorldEventAppended,
  createSystemActor,
} from "@mss/core/testing";
import type { WorldId, TimelineId } from "@mss/core/ids";

describe("InMemoryLedger", () => {
  let ledger: ReturnType<typeof createInMemoryLedger>;
  let worldId: WorldId;
  let timelineId: TimelineId;

  beforeEach(() => {
    ledger = createInMemoryLedger();
    worldId = generateWorldId();
    timelineId = generateTimelineId();
    ledger.registerTimeline(timelineId, worldId);
  });

  describe("append", () => {
    it("should append an event and return result", async () => {
      const event = createVoiceTurnStarted();

      const result = await ledger.append(event, worldId, timelineId);

      expect(result.event_id).toBe(event.event_id);
      expect(result.hash).toBeTruthy();
      expect(result.index).toBe(0);
      expect(result.timestamp).toBeTruthy();
    });

    it("should increment index for subsequent events", async () => {
      const event1 = createVoiceTurnStarted();
      const event2 = createToolCallRequested();

      const result1 = await ledger.append(event1, worldId, timelineId);
      const result2 = await ledger.append(event2, worldId, timelineId);

      expect(result1.index).toBe(0);
      expect(result2.index).toBe(1);
    });

    it("should compute different hashes for different events", async () => {
      const event1 = createVoiceTurnStarted();
      const event2 = createToolCallRequested();

      const result1 = await ledger.append(event1, worldId, timelineId);
      const result2 = await ledger.append(event2, worldId, timelineId);

      expect(result1.hash).not.toBe(result2.hash);
    });

    it("should track event count", async () => {
      expect(ledger.count()).toBe(0);

      await ledger.append(createVoiceTurnStarted(), worldId, timelineId);
      expect(ledger.count()).toBe(1);

      await ledger.append(createToolCallRequested(), worldId, timelineId);
      expect(ledger.count()).toBe(2);
    });
  });

  describe("replay", () => {
    it("should replay all events in order", async () => {
      const event1 = createVoiceTurnStarted();
      const event2 = createToolCallRequested();
      const event3 = createWorldEventAppended({ world_id: worldId, timeline_id: timelineId });

      await ledger.append(event1, worldId, timelineId);
      await ledger.append(event2, worldId, timelineId);
      await ledger.append(event3, worldId, timelineId);

      const replayed = await ledger.replay({
        world_id: worldId,
        timeline_id: timelineId,
      });

      expect(replayed).toHaveLength(3);
      expect(replayed[0].index).toBe(0);
      expect(replayed[1].index).toBe(1);
      expect(replayed[2].index).toBe(2);
    });

    it("should filter by event type", async () => {
      await ledger.append(createVoiceTurnStarted(), worldId, timelineId);
      await ledger.append(createToolCallRequested(), worldId, timelineId);
      await ledger.append(createVoiceTurnStarted(), worldId, timelineId);

      const replayed = await ledger.replay({
        world_id: worldId,
        timeline_id: timelineId,
        event_types: ["VoiceTurnStarted"],
      });

      expect(replayed).toHaveLength(2);
      expect(replayed[0].event.event_type).toBe("VoiceTurnStarted");
      expect(replayed[1].event.event_type).toBe("VoiceTurnStarted");
    });

    it("should filter by index range", async () => {
      for (let i = 0; i < 5; i++) {
        await ledger.append(createVoiceTurnStarted(), worldId, timelineId);
      }

      const replayed = await ledger.replay({
        world_id: worldId,
        timeline_id: timelineId,
        from_index: 1,
        to_index: 3,
      });

      expect(replayed).toHaveLength(3);
      expect(replayed[0].index).toBe(1);
      expect(replayed[2].index).toBe(3);
    });

    it("should respect limit", async () => {
      for (let i = 0; i < 10; i++) {
        await ledger.append(createVoiceTurnStarted(), worldId, timelineId);
      }

      const replayed = await ledger.replay({
        world_id: worldId,
        timeline_id: timelineId,
        limit: 3,
      });

      expect(replayed).toHaveLength(3);
    });
  });

  describe("fork", () => {
    it("should create a new timeline with copied events", async () => {
      // Add events to original timeline
      await ledger.append(createVoiceTurnStarted(), worldId, timelineId);
      await ledger.append(createToolCallRequested(), worldId, timelineId);
      await ledger.append(createWorldEventAppended({ world_id: worldId, timeline_id: timelineId }), worldId, timelineId);

      // Fork at index 1
      const forkResult = await ledger.fork({
        world_id: worldId,
        from_timeline_id: timelineId,
        fork_from_event_index: 1,
        new_timeline_name: "forked",
      });

      expect(forkResult.new_timeline_id).toBeTruthy();
      expect(forkResult.fork_point).toBe(1);

      // Verify forked timeline has events up to fork point
      const forkedEvents = await ledger.replay({
        world_id: worldId,
        timeline_id: forkResult.new_timeline_id,
      });

      expect(forkedEvents).toHaveLength(2); // Events 0 and 1
    });

    it("should allow independent evolution after fork", async () => {
      await ledger.append(createVoiceTurnStarted(), worldId, timelineId);

      const forkResult = await ledger.fork({
        world_id: worldId,
        from_timeline_id: timelineId,
        fork_from_event_index: 0,
      });

      // Add to original
      await ledger.append(createToolCallRequested(), worldId, timelineId);

      // Add different event to fork
      await ledger.append(createWorldEventAppended({ world_id: worldId, timeline_id: forkResult.new_timeline_id }), worldId, forkResult.new_timeline_id);

      const originalEvents = await ledger.replay({ world_id: worldId, timeline_id: timelineId });
      const forkedEvents = await ledger.replay({ world_id: worldId, timeline_id: forkResult.new_timeline_id });

      expect(originalEvents).toHaveLength(2);
      expect(forkedEvents).toHaveLength(2);
      expect(originalEvents[1].event.event_type).toBe("ToolCallRequested");
      expect(forkedEvents[1].event.event_type).toBe("WorldEventAppended");
    });
  });

  describe("getHead", () => {
    it("should return null for empty timeline", async () => {
      const emptyTimeline = generateTimelineId();
      ledger.registerTimeline(emptyTimeline, worldId);

      const head = await ledger.getHead(worldId, emptyTimeline);

      expect(head).toBeNull();
    });

    it("should return latest event", async () => {
      const event1 = createVoiceTurnStarted();
      const event2 = createToolCallRequested();

      await ledger.append(event1, worldId, timelineId);
      const result2 = await ledger.append(event2, worldId, timelineId);

      const head = await ledger.getHead(worldId, timelineId);

      expect(head).toBeTruthy();
      expect(head!.event_id).toBe(event2.event_id);
      expect(head!.hash).toBe(result2.hash);
      expect(head!.index).toBe(1);
    });
  });

  describe("verifyIntegrity", () => {
    it("should verify valid hash chain", async () => {
      const e1 = createVoiceTurnStarted();
      const e2 = createToolCallRequested();
      const e3 = createWorldEventAppended({ world_id: worldId, timeline_id: timelineId });
      
      const r1 = await ledger.append(e1, worldId, timelineId);
      const r2 = await ledger.append(e2, worldId, timelineId);
      const r3 = await ledger.append(e3, worldId, timelineId);
      
      console.log("Hash chain:");
      console.log("  Event 1 hash:", r1.hash, "prev: null");
      console.log("  Event 2 hash:", r2.hash, "prev:", r1.hash);
      console.log("  Event 3 hash:", r3.hash, "prev:", r2.hash);

      const result = await ledger.verifyIntegrity(worldId, timelineId);
      
      console.log("Verify result:", result);

      expect(result.valid).toBe(true);
    });

    it("should return valid for empty timeline", async () => {
      const emptyTimeline = generateTimelineId();
      ledger.registerTimeline(emptyTimeline, worldId);

      const result = await ledger.verifyIntegrity(worldId, emptyTimeline);

      expect(result.valid).toBe(true);
    });
  });

  describe("clear", () => {
    it("should remove all events", async () => {
      await ledger.append(createVoiceTurnStarted(), worldId, timelineId);
      await ledger.append(createToolCallRequested(), worldId, timelineId);

      expect(ledger.count()).toBe(2);

      ledger.clear();

      expect(ledger.count()).toBe(0);
    });
  });
});
