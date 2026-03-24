/**
 * World State Resource.
 * Whitepaper §5 Pillar 4: Interactive Fiction / Game Runtime
 * 
 * Worlds are event-sourced state machines exposed at:
 *   /worlds/{world_id}/timelines/{timeline_id}
 */

import { z } from "../schemas/zod";

// ─────────────────────────────────────────────────────────────────────────────
// World State Resource
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Protocol resource representing world state.
 * State is derived by replaying events from the ledger.
 */
export const WorldStateResource = z.object({
  /** World identifier */
  world_id: z.string(),
  
  /** Timeline identifier (supports branching) */
  timeline_id: z.string(),
  
  /** Index of the most recent event in this timeline */
  head_event_index: z.number().int().nonnegative(),
  
  /** Reference to entity index (graph of NPCs/items/locations) */
  entity_index_ref: z.string().optional(),
  
  /** Version of the ruleset being used */
  ruleset_version: z.string().optional(),
  
  /** Reference to the narrative engine state (Ink/Glulx) */
  narrative_state_ref: z.string().optional(),
  
  /** World creation timestamp */
  created_at: z.string().optional(),
  
  /** Last modification timestamp */
  updated_at: z.string().optional()
});

export type WorldStateResource = z.infer<typeof WorldStateResource>;

// ─────────────────────────────────────────────────────────────────────────────
// Entity Reference (for entity graph)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reference to an entity in the world.
 * Full entity data lives in the entity index.
 */
export const EntityRef = z.object({
  /** Entity identifier */
  entity_id: z.string(),
  
  /** Entity type (npc, item, location, etc.) */
  entity_type: z.string(),
  
  /** Human-readable name */
  name: z.string().optional()
});

export type EntityRef = z.infer<typeof EntityRef>;

// ─────────────────────────────────────────────────────────────────────────────
// World Event Record (for ledger)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single event record as stored in the world's event ledger.
 */
export const WorldEventRecord = z.object({
  /** Event identifier */
  event_id: z.string(),
  
  /** World this event belongs to */
  world_id: z.string(),
  
  /** Timeline this event belongs to */
  timeline_id: z.string(),
  
  /** Index in the timeline sequence */
  index: z.number().int().nonnegative(),
  
  /** Event type (game-specific) */
  event_type: z.string(),
  
  /** Event payload */
  payload: z.unknown(),
  
  /** Timestamp */
  timestamp: z.string(),
  
  /** Hash of previous event */
  prev_hash: z.string().optional(),
  
  /** Hash of this event */
  hash: z.string()
});

export type WorldEventRecord = z.infer<typeof WorldEventRecord>;
