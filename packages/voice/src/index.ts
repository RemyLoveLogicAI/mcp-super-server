/**
 * @mss/voice — Voice Transport Layer
 * Whitepaper §4.2.2 + §5 Pillar 1 + Innovation #2
 * 
 * This package will implement:
 * - STT adapters (streaming partial + final)
 * - TTS adapters (interruptible)
 * - Interrupt FSM (barge-in semantics)
 * - Voice session state management
 * 
 * Voice transport contracts live in @mss/core.
 */

// Re-export core types used by voice consumers
export type { 
  VoiceTurnStarted, 
  VoiceTurnFinalized 
} from "@mss/core/events";

export type { 
  VoiceSessionStateResource,
  ToolCallBudget 
} from "@mss/core/resources";

// ─────────────────────────────────────────────────────────────────────────────
// Voice FSM Types (stub)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Voice turn state machine states.
 */
export type VoiceTurnState =
  | "idle"       // No active turn
  | "listening"  // Receiving audio, STT active
  | "processing" // Turn finalized, processing intent
  | "speaking";  // TTS active

// Implementation intentionally deferred (contract-first)

// ─────────────────────────────────────────────────────────────────────────────
// Actual implementations (from src/)
// ─────────────────────────────────────────────────────────────────────────────

export { VoiceSessionFSM, createVoiceSession } from "./fsm.js";
export type { VoiceFSMContext, VoiceFSMState, VoiceFSMEvent, VoiceFSMEffect } from "./fsm.js";

export { MockASRAdapter } from "./asr.js";
export { MockTTSAdapter } from "./tts.js";
