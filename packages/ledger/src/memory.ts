/**
 * @mss/ledger - In-Memory Backend Implementation
 * For testing and development
 *
 * NOT for production use - no persistence
 */

import { createHash } from "crypto";
import {
  EventLedger,
  AppendResult,
  ReplayCursor,
  ReplayedEvent,
  ForkParams,
  ForkResult,
} from "@mss/core/contracts/ledger";
import { CoreEvent } from "@mss/core/events";

// ============================================================================
// Types
// ============================================================================

interface StoredEvent {
  event: CoreEvent;
  hash: string;
  index: number;
  worldId?: string;
  timelineId?: string;
  prevHash?: string;
  createdAt: string;
}

// ============================================================================
// Hash Computation
// ============================================================================

function computeEventHash(
  event: CoreEvent,
  prevHash: string | null
): string {
  // prev_hash is already set on the event object, so it's included in payload
  // We don't include it separately to avoid double-counting
  // hash is EXCLUDED because it's set AFTER computing the hash
  const { hash, ...eventWithoutHash } = event as any;
  const hashInput = JSON.stringify({
    event_type: event.event_type,
    timestamp: event.timestamp,
    actor: event.actor,
    payload: eventWithoutHash,
  });

  return createHash("sha256").update(hashInput).digest("hex");
}

// ============================================================================
// In-Memory Ledger Implementation
// ============================================================================

export class InMemoryLedger implements EventLedger {
  private events: StoredEvent[] = [];
  private timelines: Map<string, { worldId: string; headIndex: number }> = new Map();

  // --------------------------------------------------------------------------
  // Append
  // --------------------------------------------------------------------------

  async append(
    event: CoreEvent,
    worldId?: string,
    timelineId?: string
  ): Promise<AppendResult> {
    const prevHash = this.getLatestHash(worldId, timelineId);
    const index = this.getNextIndex(worldId, timelineId);

    // Set prev_hash on the event first (so it's included in hash computation)
    // Use null for consistency with prevHash parameter (JSON serializes null and undefined differently)
    (event as any).prev_hash = prevHash;
    
    // Now compute hash (includes prev_hash in payload)
    const hash = computeEventHash(event, prevHash);
    
    // Set hash on the event
    (event as any).hash = hash;

    const stored: StoredEvent = {
      event,
      hash,
      index,
      createdAt: new Date().toISOString(),
    };
    if (worldId !== undefined) stored.worldId = worldId;
    if (timelineId !== undefined) stored.timelineId = timelineId;
    if (prevHash !== null) stored.prevHash = prevHash;

    this.events.push(stored);

    // Update timeline head if applicable
    if (timelineId !== undefined) {
      const timeline = this.timelines.get(timelineId);
      if (timeline) {
        timeline.headIndex = index;
      }
    }

    return {
      event_id: event.event_id,
      hash,
      index,
      timestamp: stored.createdAt,
    };
  }

  // --------------------------------------------------------------------------
  // Replay
  // --------------------------------------------------------------------------

  async replay(cursor: ReplayCursor): Promise<ReplayedEvent[]> {
    const fromIndex = cursor.from_index ?? 0;
    let filtered = this.events.filter((e) => {
      // Filter by timeline if specified
      if (cursor.timeline_id) {
        const storedTimeline = e.timelineId;
        if (storedTimeline !== undefined && storedTimeline !== cursor.timeline_id) return false;
        if (storedTimeline === undefined) {
          // Fall back to event payload
          if ((e.event as any).timeline_id !== cursor.timeline_id) return false;
        }
      }
      // Filter by world if specified
      if (cursor.world_id) {
        const storedWorld = e.worldId;
        if (storedWorld !== undefined && storedWorld !== cursor.world_id) return false;
        if (storedWorld === undefined) {
          // Fall back to event payload
          if ((e.event as any).world_id !== cursor.world_id) return false;
        }
      }
      // Filter by from_index on the event's index within its timeline
      if (e.index < fromIndex) return false;
      return true;
    });

    if (cursor.to_index !== undefined) {
      filtered = filtered.filter((e) => e.index <= cursor.to_index!);
    }
    if (cursor.event_types && cursor.event_types.length > 0) {
      filtered = filtered.filter((e) =>
        cursor.event_types!.includes(e.event.event_type)
      );
    }

    // Sort by index
    filtered = filtered.sort((a, b) => a.index - b.index);

    // Apply limit
    if (cursor.limit) {
      filtered = filtered.slice(0, cursor.limit);
    }

    return filtered.map((stored) => ({
      index: stored.index,
      event: stored.event,
      hash: stored.hash,
    }));
  }

  // --------------------------------------------------------------------------
  // Fork
  // --------------------------------------------------------------------------

  async fork(params: ForkParams): Promise<ForkResult> {
    const newTimelineId = crypto.randomUUID();

    // Register new timeline
    this.timelines.set(newTimelineId, {
      worldId: params.world_id,
      headIndex: params.fork_from_event_index,
    });

    // Copy events up to fork point
    const sourceEvents = this.events.filter(
      (e) =>
        e.worldId === params.world_id &&
        e.timelineId === params.from_timeline_id &&
        e.index <= params.fork_from_event_index
    );

    for (const source of sourceEvents) {
      const copied: StoredEvent = {
        event: source.event,
        hash: source.hash,
        index: source.index,
        timelineId: newTimelineId,
        createdAt: source.createdAt,
      };
      if (source.worldId !== undefined) copied.worldId = source.worldId;
      if (source.prevHash !== undefined) copied.prevHash = source.prevHash;
      this.events.push(copied);
    }

    return {
      new_timeline_id: newTimelineId,
      fork_point: params.fork_from_event_index,
    };
  }

  // --------------------------------------------------------------------------
  // Get Head
  // --------------------------------------------------------------------------

  async getHead(
    worldId: string,
    timelineId: string
  ): Promise<{ event_id: string; hash: string; index: number } | null> {
    const timelineEvents = this.events
      .filter((e) => e.worldId === worldId && e.timelineId === timelineId)
      .sort((a, b) => b.index - a.index);

    if (timelineEvents.length === 0) {
      return null;
    }

    const head = timelineEvents[0]!;
    return {
      event_id: head.event.event_id,
      hash: head.hash,
      index: head.index,
    };
  }

  // --------------------------------------------------------------------------
  // Verify Integrity
  // --------------------------------------------------------------------------

  async verifyIntegrity(
    worldId: string,
    timelineId: string
  ): Promise<{ valid: boolean; broken_at_index?: number; expected_hash?: string; actual_hash?: string }> {
    // Get stored events directly to access prevHash field
    const storedEvents = this.events
      .filter((e) => e.worldId === worldId && e.timelineId === timelineId)
      .sort((a, b) => a.index - b.index);

    for (const stored of storedEvents) {
      const event = stored.event;
      const storedPrevHash = (event as any).prev_hash ?? null;
      
      const expectedHash = computeEventHash(event, storedPrevHash);

      if (stored.hash !== expectedHash) {
        return {
          valid: false,
          broken_at_index: stored.index,
          expected_hash: expectedHash,
          actual_hash: stored.hash,
        };
      }
    }

    return { valid: true };
  }

  // --------------------------------------------------------------------------
  // Test Helpers
  // --------------------------------------------------------------------------

  /** Clear all events (for testing) */
  clear(): void {
    this.events = [];
    this.timelines.clear();
  }

  /** Get event count (for testing) */
  count(): number {
    return this.events.length;
  }

  /** Register a timeline (for testing) */
  registerTimeline(timelineId: string, worldId: string): void {
    this.timelines.set(timelineId, { worldId, headIndex: -1 });
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private getLatestHash(worldId?: string, timelineId?: string): string | null {
    let filtered = this.events;

    if (worldId !== undefined) {
      filtered = filtered.filter((e) => e.worldId === worldId);
    }
    if (timelineId !== undefined) {
      filtered = filtered.filter((e) => e.timelineId === timelineId);
    }

    if (filtered.length === 0) {
      return null;
    }

    filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return filtered[0]!.hash;
  }

  private getNextIndex(worldId?: string, timelineId?: string): number {
    let filtered = this.events;

    if (worldId !== undefined) {
      filtered = filtered.filter((e) => e.worldId === worldId);
    }
    if (timelineId !== undefined) {
      filtered = filtered.filter((e) => e.timelineId === timelineId);
    }

    if (filtered.length === 0) {
      return 0;
    }

    const maxIndex = Math.max(...filtered.map((e) => e.index));
    return maxIndex + 1;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createInMemoryLedger(): EventLedger & {
  clear(): void;
  count(): number;
  registerTimeline(timelineId: string, worldId: string): void;
} {
  return new InMemoryLedger();
}
