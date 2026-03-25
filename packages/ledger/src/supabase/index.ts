/**
 * @mss/ledger - Supabase/Postgres Backend Implementation
 * Production-ready persistent ledger
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import type {
  EventLedger,
  AppendResult,
  ReplayCursor,
  ReplayedEvent,
  ForkParams,
  ForkResult,
} from "@mss/core/contracts/ledger";
import type { CoreEvent } from "@mss/core/events";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface SupabaseLedgerConfig {
  supabaseUrl: string;
  supabaseServiceKey: string;
  /** Optional schema name (defaults to 'public') */
  schema?: string;
  /** Enable debug logging */
  debug?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row Types
// ─────────────────────────────────────────────────────────────────────────────

interface EventRow {
  id: number;
  event_id: string;
  event_type: string;
  timestamp: string;
  actor: Record<string, unknown>;
  payload: Record<string, unknown>;
  hash: string;
  prev_hash: string | null;
  world_id: string | null;
  timeline_id: string | null;
  timeline_index: number;
  created_at: string;
}

interface TimelineRow {
  id: string;
  world_id: string;
  forked_from_timeline_id: string | null;
  fork_point_index: number | null;
  name: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hash Computation
// ─────────────────────────────────────────────────────────────────────────────

function computeEventHash(event: CoreEvent, prevHash: string | null): string {
  // Extract all fields except hash for the hash input
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hash, ...eventWithoutHash } = event as Record<string, unknown>;
  
  const hashInput = JSON.stringify({
    ...eventWithoutHash,
    prev_hash: prevHash,
  });
  return createHash("sha256").update(hashInput).digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase Ledger Implementation
// ─────────────────────────────────────────────────────────────────────────────

export class SupabaseLedger implements EventLedger {
  private client: SupabaseClient<any, "public", "public">;
  private debug: boolean;

  constructor(config: SupabaseLedgerConfig) {
    const schema = config.schema ?? "public";
    this.client = createClient(config.supabaseUrl, config.supabaseServiceKey) as SupabaseClient<any, "public", "public">;
    this.debug = config.debug ?? false;
  }

  // --------------------------------------------------------------------------
  // Health Check
  // --------------------------------------------------------------------------

  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      const { error } = await this.client.from("events").select("id").limit(1);
      if (error) {
        return { healthy: false, error: error.message };
      }
      return { healthy: true };
    } catch (err) {
      return { healthy: false, error: String(err) };
    }
  }

  // --------------------------------------------------------------------------
  // Append
  // --------------------------------------------------------------------------

  async append(
    event: CoreEvent,
    worldId?: string,
    timelineId?: string
  ): Promise<AppendResult> {
    // Get previous hash and next index in a single query
    const { data: latestData } = await this.client
      .from("events")
      .select("hash, timeline_index")
      .eq("world_id", worldId ?? null as any)
      .eq("timeline_id", timelineId ?? null as any)
      .order("timeline_index", { ascending: false })
      .limit(1)
      .maybeSingle();

    const prevHash = latestData?.hash ?? null;
    const nextIndex = (latestData?.timeline_index ?? -1) + 1;

    // Compute hash
    const hash = computeEventHash(event, prevHash);

    // Extract actor and payload from event, handling different event types
    const actor = (event as Record<string, unknown>).actor ?? {};
    const payload = (event as Record<string, unknown>).payload ?? {};

    // Insert event
    const row: Omit<EventRow, "id"> = {
      event_id: event.event_id,
      event_type: event.event_type,
      timestamp: event.timestamp ?? new Date().toISOString(),
      actor: actor as Record<string, unknown>,
      payload: payload as Record<string, unknown>,
      hash,
      prev_hash: prevHash,
      world_id: worldId ?? null,
      timeline_id: timelineId ?? null,
      timeline_index: nextIndex,
      created_at: new Date().toISOString(),
    };

    const { error } = await this.client.from("events").insert(row);

    if (error) {
      throw new Error(`Failed to append event: ${error.message}`);
    }

    if (this.debug) {
      console.log(`[SupabaseLedger] Appended event ${event.event_id} at index ${nextIndex}`);
    }

    return {
      event_id: event.event_id,
      hash,
      index: nextIndex,
      timestamp: row.created_at,
    };
  }

  // --------------------------------------------------------------------------
  // Replay
  // --------------------------------------------------------------------------

  async replay(cursor: ReplayCursor): Promise<ReplayedEvent[]> {
    let query = this.client
      .from("events")
      .select("event_id, event_type, timestamp, actor, payload, hash, prev_hash, world_id, timeline_id, timeline_index");

    // Apply filters
    if (cursor.world_id !== undefined) {
      query = query.eq("world_id", cursor.world_id);
    }
    if (cursor.timeline_id !== undefined) {
      query = query.eq("timeline_id", cursor.timeline_id);
    }
    if (cursor.from_index !== undefined) {
      query = query.gte("timeline_index", cursor.from_index);
    }
    if (cursor.to_index !== undefined) {
      query = query.lte("timeline_index", cursor.to_index);
    }
    if (cursor.event_types && cursor.event_types.length > 0) {
      query = query.in("event_type", cursor.event_types);
    }

    // Order by index
    query = query.order("timeline_index", { ascending: true });

    // Apply limit
    if (cursor.limit) {
      query = query.limit(cursor.limit);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to replay events: ${error.message}`);
    }

    return (data ?? []).map((row): ReplayedEvent => ({
      index: row.timeline_index,
      event: {
        event_id: row.event_id,
        event_type: row.event_type,
        timestamp: row.timestamp,
        actor: row.actor,
        payload: row.payload,
        hash: row.hash,
        prev_hash: row.prev_hash,
      } as CoreEvent,
      hash: row.hash,
    }));
  }

  // --------------------------------------------------------------------------
  // Fork
  // --------------------------------------------------------------------------

  async fork(params: ForkParams): Promise<ForkResult> {
    // Generate new timeline ID
    const newTimelineId = crypto.randomUUID();

    // Insert new timeline record
    const { error: timelineError } = await this.client.from("timelines").insert({
      id: newTimelineId,
      world_id: params.world_id,
      forked_from_timeline_id: params.from_timeline_id,
      fork_point_index: params.fork_from_event_index,
      name: params.new_timeline_name ?? null,
    });

    if (timelineError) {
      throw new Error(`Failed to create timeline: ${timelineError.message}`);
    }

    // Copy events up to fork point
    const { data: sourceEvents, error: eventsError } = await this.client
      .from("events")
      .select("*")
      .eq("world_id", params.world_id)
      .eq("timeline_id", params.from_timeline_id)
      .lte("timeline_index", params.fork_from_event_index)
      .order("timeline_index", { ascending: true });

    if (eventsError) {
      throw new Error(`Failed to fetch source events: ${eventsError.message}`);
    }

    // Insert copied events with new timeline ID
    for (let i = 0; i < (sourceEvents ?? []).length; i++) {
      const source = sourceEvents![i];
      const newRow: Omit<EventRow, "id"> = {
        event_id: source.event_id,
        event_type: source.event_type,
        timestamp: source.timestamp,
        actor: source.actor,
        payload: source.payload,
        hash: source.hash,
        prev_hash: source.prev_hash,
        world_id: params.world_id,
        timeline_id: newTimelineId,
        timeline_index: source.timeline_index,
        created_at: new Date().toISOString(),
      };

      const { error: insertError } = await this.client.from("events").insert(newRow);
      if (insertError) {
        throw new Error(`Failed to copy event: ${insertError.message}`);
      }
    }

    if (this.debug) {
      console.log(`[SupabaseLedger] Forked timeline ${newTimelineId} from ${params.from_timeline_id} at index ${params.fork_from_event_index}`);
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
    const { data, error } = await this.client
      .from("events")
      .select("event_id, hash, timeline_index")
      .eq("world_id", worldId)
      .eq("timeline_id", timelineId)
      .order("timeline_index", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return {
      event_id: data.event_id,
      hash: data.hash,
      index: data.timeline_index,
    };
  }

  // --------------------------------------------------------------------------
  // Verify Integrity
  // --------------------------------------------------------------------------

  async verifyIntegrity(
    worldId: string,
    timelineId: string
  ): Promise<{ valid: boolean; broken_at_index?: number; expected_hash?: string; actual_hash?: string }> {
    const events = await this.replay({
      world_id: worldId,
      timeline_id: timelineId,
    });

    for (const replayed of events) {
      const event = replayed.event;
      const storedPrevHash = (event as any).prev_hash ?? null;
      const expectedHash = computeEventHash(event, storedPrevHash);

      if (replayed.hash !== expectedHash) {
        const result: { valid: boolean; broken_at_index?: number; expected_hash?: string; actual_hash?: string } = {
          valid: false,
          broken_at_index: replayed.index,
          expected_hash: expectedHash,
        };
        if (replayed.hash) {
          result.actual_hash = replayed.hash;
        }
        return result;
      }
    }

    return { valid: true };
  }

  // --------------------------------------------------------------------------
  // Query Helpers
  // --------------------------------------------------------------------------

  /** Count events in a timeline */
  async count(worldId?: string, timelineId?: string): Promise<number> {
    let query = this.client.from("events").select("id", { count: "exact", head: true });

    if (worldId !== undefined) {
      query = query.eq("world_id", worldId);
    }
    if (timelineId !== undefined) {
      query = query.eq("timeline_id", timelineId);
    }

    const { count, error } = await query;

    if (error) {
      throw new Error(`Failed to count events: ${error.message}`);
    }

    return count ?? 0;
  }

  /** Delete events for testing (use with caution) */
  async _dangerousTruncate(worldId?: string, timelineId?: string): Promise<void> {
    if (worldId === undefined && timelineId === undefined) {
      throw new Error("Must specify at least worldId or timelineId for safety");
    }

    let query = this.client.from("events").delete();

    if (worldId !== undefined) {
      query = query.eq("world_id", worldId);
    }
    if (timelineId !== undefined) {
      query = query.eq("timeline_id", timelineId);
    }

    const { error } = await query;

    if (error) {
      throw new Error(`Failed to truncate events: ${error.message}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createSupabaseLedger(config: SupabaseLedgerConfig): EventLedger & {
  healthCheck(): Promise<{ healthy: boolean; error?: string }>;
  count(worldId?: string, timelineId?: string): Promise<number>;
  _dangerousTruncate(worldId?: string, timelineId?: string): Promise<void>;
} {
  return new SupabaseLedger(config);
}