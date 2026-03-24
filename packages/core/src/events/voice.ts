/**
 * Voice transport events.
 * Whitepaper §5 Pillar 1: Voice → Agent Pipeline
 */

import { z } from "../schemas/zod";
import { NonEmptyString } from "../schemas/common";
import { CoreEventBase } from "./base.js";

// ─────────────────────────────────────────────────────────────────────────────
// VoiceTurnStarted
// ─────────────────────────────────────────────────────────────────────────────

export const VoiceTurnStarted = CoreEventBase.extend({
  event_type: z.literal("VoiceTurnStarted"),
  session_id: z.string(),
  turn_id: z.number().int().nonnegative(),
  channel: NonEmptyString,
  asr_partial: z.string().optional()
});

export type VoiceTurnStarted = z.infer<typeof VoiceTurnStarted>;

// ─────────────────────────────────────────────────────────────────────────────
// VoiceTurnFinalized
// ─────────────────────────────────────────────────────────────────────────────

export const VoiceTurnFinalized = CoreEventBase.extend({
  event_type: z.literal("VoiceTurnFinalized"),
  session_id: z.string(),
  turn_id: z.number().int().nonnegative(),
  asr_final: z.string(),
  intent: z.record(z.string(), z.any()).optional(),
  embeddings_ref: z.string().optional(),
  was_interrupted: z.boolean().optional()
});

export type VoiceTurnFinalized = z.infer<typeof VoiceTurnFinalized>;

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports
// ─────────────────────────────────────────────────────────────────────────────

export const VoiceEvents = {
  VoiceTurnStarted,
  VoiceTurnFinalized
} as const;
