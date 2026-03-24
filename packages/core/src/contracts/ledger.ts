/**
 * Event Ledger Contract.
 * Whitepaper §4.2.8: Event Ledger
 * Whitepaper §5 Pillar 4: Event Sourcing
 * 
 * The ledger is an append-only event store.
 * State is derived by replaying events.
 * Branching creates forked timelines.
 */

import type { CoreEvent } from "../events";

// ─────────────────────────────────────────────────────────────────────────────
// Append Result
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of appending an event to the ledger.
 */
export type AppendResult = {
  /** Assigned event ID */
  event_id: string;
  
  /** Hash of the event (for integrity chain) */
  hash?: string;
  
  /** Index in the event sequence */
  index: number;
  
  /** Timestamp when appended */
  timestamp?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Replay Cursor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cursor for replaying events from the ledger.
 */
export type ReplayCursor = {
  /** Filter by world (optional) */
  world_id?: string;
  
  /** Filter by timeline (optional) */
  timeline_id?: string;
  
  /** Start from this event index (inclusive), defaults to 0 */
  from_index?: number;
  
  /** End at this event index (exclusive, optional) */
  to_index?: number;
  
  /** Filter by event types (optional) */
  event_types?: string[];
  
  /** Limit number of events returned */
  limit?: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Replayed Event
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An event as returned during replay.
 */
export type ReplayedEvent = {
  /** Index in the event sequence */
  index: number;
  
  /** The event data */
  event: CoreEvent;
  
  /** Hash for integrity verification */
  hash?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Fork Parameters
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parameters for forking a timeline.
 */
export type ForkParams = {
  /** World containing the timeline */
  world_id: string;
  
  /** Timeline to fork from */
  from_timeline_id: string;
  
  /** Event index to fork at */
  fork_from_event_index: number;
  
  /** Optional name for the new timeline */
  new_timeline_name?: string;
};

/**
 * Result of forking a timeline.
 */
export type ForkResult = {
  /** ID of the new timeline */
  new_timeline_id: string;
  
  /** Event index where the fork occurred */
  fork_point: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Event Ledger Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interface that event ledger implementations MUST provide.
 */
export interface EventLedger {
  /**
   * Append an event to the ledger.
   * Events are immutable once appended.
   */
  append(event: CoreEvent, worldId?: string, timelineId?: string): Promise<AppendResult>;
  
  /**
   * Replay events from the ledger.
   * Returns an array of events matching the cursor filters.
   */
  replay(cursor: ReplayCursor): Promise<ReplayedEvent[]>;
  
  /**
   * Fork a timeline to create a branch.
   * The new timeline starts with the same events up to fork_from_event_index.
   */
  fork(params: ForkParams): Promise<ForkResult>;
  
  /**
   * Get the current head (latest event index) for a timeline.
   */
  getHead?(worldId: string, timelineId: string): Promise<{ event_id: string; hash: string; index: number } | null>;
  
  /**
   * Verify integrity of an event chain.
   */
  verifyIntegrity?(
    worldId: string, 
    timelineId: string
  ): Promise<{ valid: boolean; broken_at_index?: number; expected_hash?: string; actual_hash?: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ledger Query
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query options for ledger searches.
 */
export type LedgerQuery = {
  /** World to query */
  world_id?: string;
  
  /** Timeline to query */
  timeline_id?: string;
  
  /** Filter by event types */
  event_types?: string[];
  
  /** Filter by actor */
  actor_id?: string;
  
  /** Filter by time range */
  after?: string;
  before?: string;
  
  /** Pagination */
  limit?: number;
  offset?: number;
};
