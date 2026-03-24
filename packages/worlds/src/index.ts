/**
 * @mss/worlds — World Runtime Manager
 * Whitepaper §4.2.6 + §5 Pillar 4 + Innovation #3
 */

export type {
  WorldEventAppended,
  TimelineForked
} from "@mss/core/events";

export type {
  WorldStateResource,
  WorldEventRecord,
  EntityRef
} from "@mss/core/resources";

export type {
  EventLedger,
  AppendResult,
  ReplayCursor,
  ForkParams,
  ForkResult
} from "@mss/core/contracts";

// ─────────────────────────────────────────────────────────────────────────────
// Actual implementations
// ─────────────────────────────────────────────────────────────────────────────

export { WorldState } from "./world.js";
export type {
  WorldType,
  WorldConfig,
  Entity,
  WorldEvent
} from "./world.js";

export type { Timeline } from "./timeline.js";
export { TimelineManager } from "./timeline.js";
