/**
 * @mss/ledger - Supabase Backend Implementation
 * Whitepaper §4.2.8: Event Ledger
 *
 * Implements append-only event storage with:
 * - Hash chain integrity
 * - Timeline branching
 * - Efficient replay
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import {
  EventLedger,
  AppendResult,
  ReplayCursor,
  ReplayedEvent,
  ForkParams,
  ForkResult,
} from "@mss/core/contracts/ledger";
import {
  CoreEvent,
  CoreEventEnvelope,
  EventActor,
} from "@mss/core/events";
import {
  UUID,
  EventId,
  EventHash,
  WorldId,
  TimelineId,
} from "@mss/core/ids";

// ============================================================================
// Types
// ============================================================================

export interface SupabaseLedgerConfig {
  supabaseUrl: string;
  supabaseServiceKey: string;
  /** Table name for events (default: 'events') */
  eventsTable?: string;
  /** Table name for timelines (default: 'timelines') */
  timelinesTable?: string;
}

interface EventRow {
  id: string;
  event_type: string;
  timestamp: string;
  actor_canonical_user_id: string | null;
  actor_agent_id: string | null;
  actor_platform: string | null;
  actor_system: boolean;
  world_id: string | null;
  timeline_id: string | null;
  event_index: number | null;
  prev_hash: string | null;
  hash: string;
  payload: Record<string, unknown>;
  created_at: string;
}

interface TimelineRow {
  id: string;
  world_id: string;
  name: string | null;
  forked_from_timeline_id: string | null;
  fork_point_event_index: number | null;
  head_event_index: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Hash Computation
// ============================================================================

function computeEventHash(
  event: CoreEvent,
  prevHash: string | null
): string {
  const hashInput = JSON.stringify({
    prev_hash: prevHash,
    event_type: event.event_type,
    timestamp: event.timestamp,
    actor: event.actor,
    payload: event,
  });

  return createHash("sha256").update(hashInput).digest("hex");
}

// ============================================================================
// Actor Serialization
// ============================================================================

function serializeActor(actor: EventActor): {
  actor_canonical_user_id: string | null;
  actor_agent_id: string | null;
  actor_platform: string | null;
  actor_system: boolean;
} {
  if ("canonical_user_id" in actor) {
    return {
      actor_canonical_user_id: actor.canonical_user_id ?? null,
      actor_agent_id: null,
      actor_platform: actor.platform ?? null,
      actor_system: false,
    };
  }
  if ("agent_id" in actor) {
    return {
      actor_canonical_user_id: null,
      actor_agent_id: actor.agent_id ?? null,
      actor_platform: null,
      actor_system: false,
    };
  }
  // System actor
  return {
    actor_canonical_user_id: null,
    actor_agent_id: null,
    actor_platform: null,
    actor_system: true,
  };
}

function deserializeActor(row: EventRow): EventActor {
  if (row.actor_system) {
    return { system: true };
  }
  if (row.actor_agent_id) {
    return { agent_id: row.actor_agent_id };
  }
  if (row.actor_canonical_user_id) {
    return {
      canonical_user_id: row.actor_canonical_user_id as UUID,
      platform: row.actor_platform ?? undefined,
    };
  }
  return { system: true };
}

// ============================================================================
// Supabase Ledger Implementation
// ============================================================================

export class SupabaseLedger implements EventLedger {
  private client: SupabaseClient;
  private eventsTable: string;
  private timelinesTable: string;

  constructor(config: SupabaseLedgerConfig) {
    this.client = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: { persistSession: false },
    });
    this.eventsTable = config.eventsTable ?? "events";
    this.timelinesTable = config.timelinesTable ?? "timelines";
  }

  // --------------------------------------------------------------------------
  // Append
  // --------------------------------------------------------------------------

  async append(
    event: CoreEvent,
    worldId?: WorldId,
    timelineId?: TimelineId
  ): Promise<AppendResult> {
    // Get previous hash for chain
    const prevHash = await this.getLatestHash(worldId, timelineId);

    // Compute hash
    const hash = computeEventHash(event, prevHash);

    // Get next event index if scoped to timeline
    let eventIndex: number | null = null;
    if (worldId && timelineId) {
      eventIndex = await this.getNextEventIndex(worldId, timelineId);
    }

    // Serialize actor
    const actorFields = serializeActor(event.actor);

    // Insert event
    const { data, error } = await this.client
      .from(this.eventsTable)
      .insert({
        id: event.event_id,
        event_type: event.event_type,
        timestamp: event.timestamp,
        ...actorFields,
        world_id: worldId ?? null,
        timeline_id: timelineId ?? null,
        event_index: eventIndex,
        prev_hash: prevHash,
        hash,
        payload: event,
      })
      .select("id, hash, event_index, created_at")
      .single();

    if (error) {
      throw new Error(`Failed to append event: ${error.message}`);
    }

    return {
      event_id: data.id as EventId,
      hash: data.hash as EventHash,
      index: data.event_index ?? 0,
      timestamp: data.created_at,
    };
  }

  // --------------------------------------------------------------------------
  // Replay
  // --------------------------------------------------------------------------

  async replay(cursor: ReplayCursor): Promise<ReplayedEvent[]> {
    let query = this.client
      .from(this.eventsTable)
      .select("*")
      .order("event_index", { ascending: true });

    // Apply cursor filters
    if (cursor.world_id) {
      query = query.eq("world_id", cursor.world_id);
    }
    if (cursor.timeline_id) {
      query = query.eq("timeline_id", cursor.timeline_id);
    }
    if (cursor.from_index !== undefined) {
      query = query.gte("event_index", cursor.from_index);
    }
    if (cursor.to_index !== undefined) {
      query = query.lte("event_index", cursor.to_index);
    }
    if (cursor.event_types && cursor.event_types.length > 0) {
      query = query.in("event_type", cursor.event_types);
    }
    if (cursor.limit) {
      query = query.limit(cursor.limit);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to replay events: ${error.message}`);
    }

    return (data as EventRow[]).map((row) => ({
      index: row.event_index ?? 0,
      event: this.rowToEvent(row),
      hash: row.hash as EventHash,
    }));
  }

  // --------------------------------------------------------------------------
  // Fork
  // --------------------------------------------------------------------------

  async fork(params: ForkParams): Promise<ForkResult> {
    // Create new timeline
    const { data: timeline, error: timelineError } = await this.client
      .from(this.timelinesTable)
      .insert({
        world_id: params.world_id,
        name: params.new_timeline_name ?? null,
        forked_from_timeline_id: params.from_timeline_id,
        fork_point_event_index: params.fork_from_event_index,
        head_event_index: params.fork_from_event_index,
      })
      .select("id")
      .single();

    if (timelineError) {
      throw new Error(`Failed to create fork: ${timelineError.message}`);
    }

    const newTimelineId = timeline.id as TimelineId;

    // Copy events up to fork point
    const { data: sourceEvents, error: eventsError } = await this.client
      .from(this.eventsTable)
      .select("*")
      .eq("world_id", params.world_id)
      .eq("timeline_id", params.from_timeline_id)
      .lte("event_index", params.fork_from_event_index)
      .order("event_index", { ascending: true });

    if (eventsError) {
      throw new Error(`Failed to read source events: ${eventsError.message}`);
    }

    // Insert copied events with new timeline_id
    if (sourceEvents && sourceEvents.length > 0) {
      const copiedEvents = (sourceEvents as EventRow[]).map((row) => ({
        ...row,
        id: crypto.randomUUID(), // New ID for copied event
        timeline_id: newTimelineId,
      }));

      const { error: insertError } = await this.client
        .from(this.eventsTable)
        .insert(copiedEvents);

      if (insertError) {
        throw new Error(`Failed to copy events to fork: ${insertError.message}`);
      }
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
    worldId: WorldId,
    timelineId: TimelineId
  ): Promise<{ event_id: EventId; hash: EventHash; index: number } | null> {
    const { data, error } = await this.client
      .from(this.eventsTable)
      .select("id, hash, event_index")
      .eq("world_id", worldId)
      .eq("timeline_id", timelineId)
      .order("event_index", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows found
        return null;
      }
      throw new Error(`Failed to get head: ${error.message}`);
    }

    return {
      event_id: data.id as EventId,
      hash: data.hash as EventHash,
      index: data.event_index,
    };
  }

  // --------------------------------------------------------------------------
  // Verify Integrity
  // --------------------------------------------------------------------------

  async verifyIntegrity(
    worldId: WorldId,
    timelineId: TimelineId
  ): Promise<{ valid: boolean; broken_at_index?: number; expected_hash?: string; actual_hash?: string }> {
    const events = await this.replay({
      world_id: worldId,
      timeline_id: timelineId,
    });

    let prevHash: string | null = null;

    for (const { index, event, hash } of events) {
      const expectedHash = computeEventHash(event, prevHash);

      if (hash === undefined || expectedHash !== hash) {
        const result: { valid: false; broken_at_index: number; expected_hash: string; actual_hash?: string } = {
          valid: false,
          broken_at_index: index,
          expected_hash: expectedHash,
        };
        if (hash !== undefined) {
          result.actual_hash = hash;
        }
        return result;
      }

      prevHash = hash;
    }

    return { valid: true };
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private async getLatestHash(
    worldId?: WorldId,
    timelineId?: TimelineId
  ): Promise<string | null> {
    let query = this.client
      .from(this.eventsTable)
      .select("hash")
      .order("created_at", { ascending: false })
      .limit(1);

    if (worldId) {
      query = query.eq("world_id", worldId);
    }
    if (timelineId) {
      query = query.eq("timeline_id", timelineId);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows found - this is the first event
        return null;
      }
      throw new Error(`Failed to get latest hash: ${error.message}`);
    }

    return data?.hash ?? null;
  }

  private async getNextEventIndex(
    worldId: WorldId,
    timelineId: TimelineId
  ): Promise<number> {
    const { data, error } = await this.client
      .from(this.eventsTable)
      .select("event_index")
      .eq("world_id", worldId)
      .eq("timeline_id", timelineId)
      .order("event_index", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows found - start at 0
        return 0;
      }
      throw new Error(`Failed to get event index: ${error.message}`);
    }

    return (data?.event_index ?? -1) + 1;
  }

  private rowToEvent(row: EventRow): CoreEvent {
    // The payload contains the full event
    const payload = row.payload as CoreEvent;

    // Ensure actor is properly deserialized
    return {
      ...payload,
      actor: deserializeActor(row),
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createSupabaseLedger(config: SupabaseLedgerConfig): EventLedger {
  return new SupabaseLedger(config);
}
