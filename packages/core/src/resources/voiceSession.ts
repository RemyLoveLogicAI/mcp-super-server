/**
 * Voice Session State Resource.
 * Whitepaper §5 Pillar 1: Voice Session State (minimum schema)
 * 
 * This is a protocol-addressable resource representing the current
 * state of a voice session. It is exposed at:
 *   /voice/sessions/{session_id}
 */

import { z } from "../schemas/zod";
import { TTSStreamState } from "../schemas/common";

// ─────────────────────────────────────────────────────────────────────────────
// Tool Call Budget
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Budget constraints for tool calls within a session.
 * Prevents runaway agent behavior.
 */
export const ToolCallBudget = z.object({
  /** Maximum number of tool calls allowed */
  max_calls: z.number().int().positive(),
  
  /** Remaining tool calls */
  remaining_calls: z.number().int().nonnegative(),
  
  /** Maximum cost units (optional) */
  max_cost_units: z.number().nonnegative().optional(),
  
  /** Remaining cost units (optional) */
  remaining_cost_units: z.number().nonnegative().optional(),
  
  /** Maximum execution time in ms (optional) */
  max_time_ms: z.number().int().positive().optional(),
  
  /** Remaining execution time in ms (optional) */
  remaining_time_ms: z.number().int().nonnegative().optional()
});

export type ToolCallBudget = z.infer<typeof ToolCallBudget>;

// ─────────────────────────────────────────────────────────────────────────────
// Voice Session State Resource
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Protocol resource representing voice session state.
 * This is the source of truth for a voice interaction.
 */
export const VoiceSessionStateResource = z.object({
  /** Unique session identifier */
  session_id: z.string(),
  
  /** Canonical user ID (resolved from identity mesh) */
  canonical_user_id: z.string(),
  
  /** Channel this session is on */
  channel: z.string(),
  
  /** Current turn number (monotonic) */
  turn_id: z.number().int().nonnegative(),
  
  /** Partial ASR hypothesis (streaming) */
  asr_partial: z.string().optional(),
  
  /** Final ASR transcription (after turn finalization) */
  asr_final: z.string().optional(),
  
  /** Extracted intent (structured, versioned) */
  intent: z.record(z.string(), z.any()).optional(),
  
  /** Barge-in interrupt flag */
  interrupt_flag: z.boolean(),
  
  /** Current TTS stream state */
  tts_stream_state: TTSStreamState,
  
  /** Reference to embeddings in vector store */
  embeddings_ref: z.string().optional(),
  
  /** Tool call budget for this session */
  tool_call_budget: ToolCallBudget,
  
  /** Session metadata */
  metadata: z.record(z.string(), z.any()).optional(),
  
  /** Session start time */
  started_at: z.string().optional(),
  
  /** Last activity time */
  last_activity_at: z.string().optional()
});

export type VoiceSessionStateResource = z.infer<typeof VoiceSessionStateResource>;
