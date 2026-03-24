/**
 * Base event schema for all core events.
 * Whitepaper §12 Appendix A
 * 
 * Every event in the system extends this base structure.
 * Events are immutable and append-only.
 */

import type { EventId } from "../ids";
import { z } from "../schemas/zod";
import { ISODateTime, NonEmptyString, Hash } from "../schemas/common";

// ─────────────────────────────────────────────────────────────────────────────
// Actor Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The actor that caused this event.
 * At least one of these should be set.
 */
export const EventActor = z.object({
  canonical_user_id: z.string().optional(),
  agent_id: z.string().optional(),
  platform: z.string().optional(),
  system: z.boolean().optional()  // True for system-generated events
});
export type EventActor = z.infer<typeof EventActor>;

// ─────────────────────────────────────────────────────────────────────────────
// Base Event Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base schema shared by all core events.
 * 
 * Event sourcing pattern: prev_hash creates a hash chain for integrity.
 */
export const CoreEventBase = z.object({
  /** Unique event identifier */
  event_id: z.string(),
  
  /** Discriminator for event type */
  event_type: NonEmptyString,
  
  /** ISO 8601 timestamp when event was created */
  timestamp: ISODateTime,
  
  /** Who or what caused this event */
  actor: EventActor,
  
  /** Hash of the previous event in the chain (for integrity) */
  prev_hash: Hash.optional(),
  
  /** Hash of this event's content */
  hash: Hash.optional()
});

export type CoreEventBase = z.infer<typeof CoreEventBase>;

// ─────────────────────────────────────────────────────────────────────────────
// Helper Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Utility type for wrapping specific event payloads with the base envelope.
 */
export type CoreEventEnvelope<TPayload extends object> = CoreEventBase & TPayload & {
  event_id: EventId;
};

/**
 * All possible event type discriminators.
 */
export type CoreEventType = 
  | "VoiceTurnStarted"
  | "VoiceTurnFinalized"
  | "ToolCallRequested"
  | "ToolCallCompleted"
  | "ToolCallCanceled"
  | "WorldEventAppended"
  | "IdentityLinked"
  | "IdentityUnlinked"
  | "TimelineForked";
