/**
 * World state events.
 * Whitepaper §5 Pillar 4: Interactive Fiction / Game Runtime
 */

import { z } from "../schemas/zod";
import { CoreEventBase } from "./base.js";

export const WorldEventAppended = CoreEventBase.extend({
  event_type: z.literal("WorldEventAppended"),
  world_id: z.string(),
  timeline_id: z.string(),
  event_index: z.number().int().nonnegative().optional(),
  world_event_type: z.string(),
  payload: z.unknown()
});

export type WorldEventAppended = z.infer<typeof WorldEventAppended>;

export const TimelineForked = CoreEventBase.extend({
  event_type: z.literal("TimelineForked"),
  world_id: z.string(),
  from_timeline_id: z.string(),
  new_timeline_id: z.string(),
  fork_from_event_index: z.number().int().nonnegative()
});

export type TimelineForked = z.infer<typeof TimelineForked>;

export const WorldEvents = {
  WorldEventAppended,
  TimelineForked
} as const;
