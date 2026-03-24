/**
 * Core events barrel export.
 * Whitepaper §12 Appendix A
 * 
 * All system state changes are represented as events.
 * Events are immutable and append-only.
 */

import { z } from "../schemas/zod";

// Re-export individual event modules
export * from "./base.js";
export * from "./voice.js";
export * from "./tools.js";
export * from "./world.js";
export * from "./identity.js";

// Import for union type
import { VoiceTurnStarted, VoiceTurnFinalized } from "./voice.js";
import { ToolCallRequested, ToolCallCompleted, ToolCallCanceled } from "./tools.js";
import { WorldEventAppended, TimelineForked } from "./world.js";
import { IdentityLinked, IdentityUnlinked } from "./identity.js";

// ─────────────────────────────────────────────────────────────────────────────
// Union of All Core Events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discriminated union of all core event types.
 * Use event_type field to discriminate.
 */
export const CoreEvent = z.discriminatedUnion("event_type", [
  VoiceTurnStarted,
  VoiceTurnFinalized,
  ToolCallRequested,
  ToolCallCompleted,
  ToolCallCanceled,
  WorldEventAppended,
  TimelineForked,
  IdentityLinked,
  IdentityUnlinked
]);

export type CoreEvent = z.infer<typeof CoreEvent>;

// ─────────────────────────────────────────────────────────────────────────────
// Event Type Guards
// ─────────────────────────────────────────────────────────────────────────────

export function isVoiceEvent(event: CoreEvent): event is VoiceTurnStarted | VoiceTurnFinalized {
  return event.event_type === "VoiceTurnStarted" || event.event_type === "VoiceTurnFinalized";
}

export function isToolEvent(event: CoreEvent): event is ToolCallRequested | ToolCallCompleted | ToolCallCanceled {
  return (
    event.event_type === "ToolCallRequested" ||
    event.event_type === "ToolCallCompleted" ||
    event.event_type === "ToolCallCanceled"
  );
}

export function isWorldEvent(event: CoreEvent): event is WorldEventAppended | TimelineForked {
  return event.event_type === "WorldEventAppended" || event.event_type === "TimelineForked";
}

export function isIdentityEvent(event: CoreEvent): event is IdentityLinked | IdentityUnlinked {
  return event.event_type === "identity.linked" || event.event_type === "identity.unlinked";
}
