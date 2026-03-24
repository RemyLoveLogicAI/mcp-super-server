/**
 * @mss/voice - Voice Session Finite State Machine
 * Whitepaper §4.2.2 + §5 Pillar 1 + Innovation #2
 *
 * Patent Surface: Voice-Native MCP Transport Layer
 * - Voice turns tied to protocol resources with interrupt semantics
 * - Deterministic cancellation on barge-in
 *
 * CRITICAL: MUST emit ToolCallCanceled on barge-in
 */

import { z } from "zod";
import {
  VoiceTurnStarted,
  VoiceTurnFinalized,
} from "@mss/core/events/voice";
import {
  ToolCallRequested,
  ToolCallCompleted,
  ToolCallCanceled,
} from "@mss/core/events/tools";
import { VoiceSessionStateResource } from "@mss/core/resources/voiceSession";
import {
  UUID,
  SessionId,
  TurnId,
  EventId,
  ToolCallId,
} from "@mss/core/ids";

// ============================================================================
// FSM States
// ============================================================================

export const VoiceFSMState = z.enum([
  "idle",
  "listening",
  "processing",
  "speaking",
  "interrupted",
]);
export type VoiceFSMState = z.infer<typeof VoiceFSMState>;

// ============================================================================
// FSM Events (inputs that trigger transitions)
// ============================================================================

export const VoiceFSMEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("AUDIO_START") }),
  z.object({ type: z.literal("AUDIO_END") }),
  z.object({ type: z.literal("ASR_PARTIAL"), text: z.string() }),
  z.object({ type: z.literal("ASR_FINAL"), text: z.string() }),
  z.object({ type: z.literal("INTENT_RESOLVED"), intent: z.record(z.unknown()) }),
  z.object({ type: z.literal("TTS_START") }),
  z.object({ type: z.literal("TTS_COMPLETE") }),
  z.object({ type: z.literal("BARGE_IN") }),
  z.object({ type: z.literal("TIMEOUT") }),
  z.object({ type: z.literal("TOOL_CALL_START"), tool_call_id: z.string() }),
  z.object({ type: z.literal("TOOL_CALL_COMPLETE"), tool_call_id: z.string(), success: z.boolean() }),
  z.object({ type: z.literal("RESET") }),
]);
export type VoiceFSMEvent = z.infer<typeof VoiceFSMEvent>;

// ============================================================================
// FSM Side Effects (outputs from transitions)
// ============================================================================

export type VoiceFSMEffect =
  | { type: "emit_turn_started"; turn_id: TurnId }
  | { type: "emit_turn_finalized"; turn_id: TurnId; asr_final: string; intent?: Record<string, unknown> }
  | { type: "emit_tool_canceled"; tool_call_id: ToolCallId; reason: string }
  | { type: "cancel_tts" }
  | { type: "cancel_pending_tools" }
  | { type: "start_silence_timer"; duration_ms: number }
  | { type: "clear_timers" }
  | { type: "log"; message: string };

// ============================================================================
// FSM Context (extended state)
// ============================================================================

export interface VoiceFSMContext {
  session_id: SessionId;
  canonical_user_id: UUID;
  channel: string;
  current_turn_id: number;
  asr_partial: string;
  asr_final: string;
  intent?: Record<string, unknown>;
  pending_tool_calls: Set<ToolCallId>;
  tts_stream_active: boolean;
  interrupt_flag: boolean;
  last_activity_at: string;
}

// ============================================================================
// FSM Transition Result
// ============================================================================

export interface VoiceFSMTransition {
  next_state: VoiceFSMState;
  context: VoiceFSMContext;
  effects: VoiceFSMEffect[];
}

// ============================================================================
// State Transition Table
// ============================================================================

type TransitionHandler = (
  context: VoiceFSMContext,
  event: VoiceFSMEvent
) => VoiceFSMTransition;

const createTransition = (
  next_state: VoiceFSMState,
  context: VoiceFSMContext,
  effects: VoiceFSMEffect[] = []
): VoiceFSMTransition => ({
  next_state,
  context: { ...context, last_activity_at: new Date().toISOString() },
  effects,
});

// ============================================================================
// Transition Handlers by State
// ============================================================================

const idleHandlers: Record<VoiceFSMEvent["type"], TransitionHandler | null> = {
  AUDIO_START: (ctx) => {
    const newTurnId = ctx.current_turn_id + 1;
    const { intent: _i1, ...ctxNoIntent1 } = ctx;
    return createTransition(
      "listening",
      { ...ctxNoIntent1, current_turn_id: newTurnId, asr_partial: "", asr_final: "" },
      [
        { type: "emit_turn_started", turn_id: newTurnId as unknown as TurnId },
        { type: "start_silence_timer", duration_ms: 30000 },
      ]
    );
  },
  AUDIO_END: null,
  ASR_PARTIAL: null,
  ASR_FINAL: null,
  INTENT_RESOLVED: null,
  TTS_START: null,
  TTS_COMPLETE: null,
  BARGE_IN: null,
  TIMEOUT: null,
  TOOL_CALL_START: null,
  TOOL_CALL_COMPLETE: null,
  RESET: (ctx) => createTransition("idle", ctx, [{ type: "clear_timers" }]),
};

const listeningHandlers: Record<VoiceFSMEvent["type"], TransitionHandler | null> = {
  AUDIO_START: null, // Already listening
  AUDIO_END: (ctx) => {
    if (ctx.asr_partial || ctx.asr_final) {
      // We have speech, move to processing
      return createTransition("processing", ctx, [{ type: "clear_timers" }]);
    }
    // No speech detected, go back to idle
    return createTransition("idle", ctx, [{ type: "clear_timers" }]);
  },
  ASR_PARTIAL: (ctx, event) => {
    if (event.type !== "ASR_PARTIAL") return createTransition("listening", ctx);
    return createTransition("listening", { ...ctx, asr_partial: event.text });
  },
  ASR_FINAL: (ctx, event) => {
    if (event.type !== "ASR_FINAL") return createTransition("listening", ctx);
    return createTransition("processing", { ...ctx, asr_final: event.text, asr_partial: "" }, [
      { type: "clear_timers" },
    ]);
  },
  INTENT_RESOLVED: null,
  TTS_START: null,
  TTS_COMPLETE: null,
  BARGE_IN: null, // Can't barge-in while listening
  TIMEOUT: (ctx) => createTransition("idle", ctx, [
    { type: "emit_turn_finalized", turn_id: ctx.current_turn_id as unknown as TurnId, asr_final: ctx.asr_final || ctx.asr_partial },
    { type: "log", message: "Silence timeout during listening" },
  ]),
  TOOL_CALL_START: null,
  TOOL_CALL_COMPLETE: null,
  RESET: (ctx) => createTransition("idle", ctx, [{ type: "clear_timers" }]),
};

const processingHandlers: Record<VoiceFSMEvent["type"], TransitionHandler | null> = {
  AUDIO_START: (ctx) => {
    // User started speaking while we're processing - this is a barge-in
    const cancelEffects: VoiceFSMEffect[] = [
      { type: "cancel_pending_tools" },
    ];
    // Cancel all pending tools
    for (const toolCallId of ctx.pending_tool_calls) {
      cancelEffects.push({
        type: "emit_tool_canceled",
        tool_call_id: toolCallId,
        reason: "barge_in_during_processing",
      });
    }
    const newTurnId = ctx.current_turn_id + 1;
    const { intent: _i2, ...ctxNoIntent2 } = ctx;
    return createTransition(
      "listening",
      {
        ...ctxNoIntent2,
        current_turn_id: newTurnId,
        pending_tool_calls: new Set(),
        interrupt_flag: true,
        asr_partial: "",
        asr_final: "",
      },
      [
        ...cancelEffects,
        { type: "emit_turn_started", turn_id: newTurnId as unknown as TurnId },
      ]
    );
  },
  AUDIO_END: null,
  ASR_PARTIAL: null,
  ASR_FINAL: null,
  INTENT_RESOLVED: (ctx, event) => {
    if (event.type !== "INTENT_RESOLVED") return createTransition("processing", ctx);
    return createTransition("processing", { ...ctx, intent: event.intent }, [
      { type: "emit_turn_finalized", turn_id: ctx.current_turn_id as unknown as TurnId, asr_final: ctx.asr_final, intent: event.intent },
    ]);
  },
  TTS_START: (ctx) => createTransition("speaking", { ...ctx, tts_stream_active: true }),
  TTS_COMPLETE: null,
  BARGE_IN: null, // Handled via AUDIO_START
  TIMEOUT: (ctx) => {
    const cancelEffects: VoiceFSMEffect[] = [];
    for (const toolCallId of ctx.pending_tool_calls) {
      cancelEffects.push({
        type: "emit_tool_canceled",
        tool_call_id: toolCallId,
        reason: "processing_timeout",
      });
    }
    return createTransition("idle", { ...ctx, pending_tool_calls: new Set() }, [
      ...cancelEffects,
      { type: "log", message: "Processing timeout" },
    ]);
  },
  TOOL_CALL_START: (ctx, event) => {
    if (event.type !== "TOOL_CALL_START") return createTransition("processing", ctx);
    const newPending = new Set(ctx.pending_tool_calls);
    newPending.add(event.tool_call_id as ToolCallId);
    return createTransition("processing", { ...ctx, pending_tool_calls: newPending });
  },
  TOOL_CALL_COMPLETE: (ctx, event) => {
    if (event.type !== "TOOL_CALL_COMPLETE") return createTransition("processing", ctx);
    const newPending = new Set(ctx.pending_tool_calls);
    newPending.delete(event.tool_call_id as ToolCallId);
    return createTransition("processing", { ...ctx, pending_tool_calls: newPending });
  },
  RESET: (ctx) => createTransition("idle", ctx, [{ type: "cancel_pending_tools" }, { type: "clear_timers" }]),
};

const speakingHandlers: Record<VoiceFSMEvent["type"], TransitionHandler | null> = {
  AUDIO_START: (ctx) => {
    // BARGE-IN: User interrupted TTS
    // CRITICAL: Must cancel TTS and any pending tool calls
    const cancelEffects: VoiceFSMEffect[] = [
      { type: "cancel_tts" },
      { type: "cancel_pending_tools" },
    ];
    for (const toolCallId of ctx.pending_tool_calls) {
      cancelEffects.push({
        type: "emit_tool_canceled",
        tool_call_id: toolCallId,
        reason: "barge_in",
      });
    }
    const newTurnId = ctx.current_turn_id + 1;
    const { intent: _i3, ...ctxNoIntent3 } = ctx;
    return createTransition(
      "interrupted",
      {
        ...ctxNoIntent3,
        current_turn_id: newTurnId,
        pending_tool_calls: new Set(),
        tts_stream_active: false,
        interrupt_flag: true,
        asr_partial: "",
        asr_final: "",
      },
      [
        ...cancelEffects,
        { type: "emit_turn_started", turn_id: newTurnId as unknown as TurnId },
      ]
    );
  },
  AUDIO_END: null,
  ASR_PARTIAL: null,
  ASR_FINAL: null,
  INTENT_RESOLVED: null,
  TTS_START: null,
  TTS_COMPLETE: (ctx) => createTransition("idle", { ...ctx, tts_stream_active: false, interrupt_flag: false }),
  BARGE_IN: (ctx) => {
    // Explicit barge-in signal
    const cancelEffects: VoiceFSMEffect[] = [
      { type: "cancel_tts" },
    ];
    for (const toolCallId of ctx.pending_tool_calls) {
      cancelEffects.push({
        type: "emit_tool_canceled",
        tool_call_id: toolCallId,
        reason: "explicit_barge_in",
      });
    }
    return createTransition(
      "interrupted",
      { ...ctx, tts_stream_active: false, interrupt_flag: true, pending_tool_calls: new Set() },
      cancelEffects
    );
  },
  TIMEOUT: null,
  TOOL_CALL_START: (ctx, event) => {
    if (event.type !== "TOOL_CALL_START") return createTransition("speaking", ctx);
    const newPending = new Set(ctx.pending_tool_calls);
    newPending.add(event.tool_call_id as ToolCallId);
    return createTransition("speaking", { ...ctx, pending_tool_calls: newPending });
  },
  TOOL_CALL_COMPLETE: (ctx, event) => {
    if (event.type !== "TOOL_CALL_COMPLETE") return createTransition("speaking", ctx);
    const newPending = new Set(ctx.pending_tool_calls);
    newPending.delete(event.tool_call_id as ToolCallId);
    return createTransition("speaking", { ...ctx, pending_tool_calls: newPending });
  },
  RESET: (ctx) => createTransition("idle", ctx, [{ type: "cancel_tts" }, { type: "clear_timers" }]),
};

const interruptedHandlers: Record<VoiceFSMEvent["type"], TransitionHandler | null> = {
  AUDIO_START: null, // Already handling interrupt
  AUDIO_END: (ctx) => createTransition("listening", ctx),
  ASR_PARTIAL: (ctx, event) => {
    if (event.type !== "ASR_PARTIAL") return createTransition("interrupted", ctx);
    return createTransition("listening", { ...ctx, asr_partial: event.text });
  },
  ASR_FINAL: (ctx, event) => {
    if (event.type !== "ASR_FINAL") return createTransition("interrupted", ctx);
    return createTransition("processing", { ...ctx, asr_final: event.text, asr_partial: "" });
  },
  INTENT_RESOLVED: null,
  TTS_START: null,
  TTS_COMPLETE: null,
  BARGE_IN: null,
  TIMEOUT: (ctx) => createTransition("idle", { ...ctx, interrupt_flag: false }),
  TOOL_CALL_START: null,
  TOOL_CALL_COMPLETE: null,
  RESET: (ctx) => createTransition("idle", { ...ctx, interrupt_flag: false }, [{ type: "clear_timers" }]),
};

// ============================================================================
// State Machine
// ============================================================================

const stateHandlers: Record<VoiceFSMState, Record<VoiceFSMEvent["type"], TransitionHandler | null>> = {
  idle: idleHandlers,
  listening: listeningHandlers,
  processing: processingHandlers,
  speaking: speakingHandlers,
  interrupted: interruptedHandlers,
};

export class VoiceSessionFSM {
  private state: VoiceFSMState;
  private context: VoiceFSMContext;

  constructor(
    sessionId: SessionId,
    canonicalUserId: UUID,
    channel: string
  ) {
    this.state = "idle";
    this.context = {
      session_id: sessionId,
      canonical_user_id: canonicalUserId,
      channel,
      current_turn_id: 0,
      asr_partial: "",
      asr_final: "",
      pending_tool_calls: new Set(),
      tts_stream_active: false,
      interrupt_flag: false,
      last_activity_at: new Date().toISOString(),
    };
  }

  /**
   * Process an event and return the transition result.
   * The caller is responsible for executing effects.
   */
  transition(event: VoiceFSMEvent): VoiceFSMTransition {
    const handlers = stateHandlers[this.state];
    const handler = handlers[event.type];

    if (!handler) {
      // Invalid transition - stay in current state
      return {
        next_state: this.state,
        context: this.context,
        effects: [
          { type: "log", message: `Invalid transition: ${this.state} + ${event.type}` },
        ],
      };
    }

    const result = handler(this.context, event);

    // Update internal state
    this.state = result.next_state;
    this.context = result.context;

    return result;
  }

  /**
   * Get current state.
   */
  getState(): VoiceFSMState {
    return this.state;
  }

  /**
   * Get current context.
   */
  getContext(): Readonly<VoiceFSMContext> {
    return this.context;
  }

  /**
   * Check if there are pending tool calls.
   */
  hasPendingToolCalls(): boolean {
    return this.context.pending_tool_calls.size > 0;
  }

  /**
   * Check if TTS is active.
   */
  isSpeaking(): boolean {
    return this.context.tts_stream_active;
  }

  /**
   * Check if interrupt flag is set.
   */
  wasInterrupted(): boolean {
    return this.context.interrupt_flag;
  }

  /**
   * Convert to VoiceSessionStateResource for persistence.
   */
  toResource(): VoiceSessionStateResource {
    return {
      session_id: this.context.session_id,
      canonical_user_id: this.context.canonical_user_id,
      channel: this.context.channel,
      turn_id: this.context.current_turn_id as unknown as TurnId,
      asr_partial: this.context.asr_partial || undefined,
      asr_final: this.context.asr_final || undefined,
      intent: this.context.intent,
      interrupt_flag: this.context.interrupt_flag,
      tts_stream_state: this.context.tts_stream_active ? "playing" : "idle",
      embeddings_ref: undefined,
      tool_call_budget: {
        max_calls: 10,
        remaining_calls: 10,
      },
      metadata: {},
      started_at: this.context.last_activity_at,
      last_activity_at: this.context.last_activity_at,
    };
  }

  /**
   * Restore from VoiceSessionStateResource.
   */
  static fromResource(resource: VoiceSessionStateResource): VoiceSessionFSM {
    const fsm = new VoiceSessionFSM(
      resource.session_id as SessionId,
      resource.canonical_user_id as UUID,
      resource.channel
    );
    const restoredContext: VoiceFSMContext = {
      ...fsm.context,
      current_turn_id: resource.turn_id as unknown as number,
      asr_partial: resource.asr_partial ?? "",
      asr_final: resource.asr_final ?? "",
      interrupt_flag: resource.interrupt_flag,
      tts_stream_active: resource.tts_stream_state === "playing",
      last_activity_at: resource.last_activity_at ?? new Date().toISOString(),
    };
    if (resource.intent !== undefined) restoredContext.intent = resource.intent;
    fsm.context = restoredContext;
    // Infer state from resource
    if (resource.tts_stream_state === "playing") {
      fsm.state = "speaking";
    } else if (resource.interrupt_flag) {
      fsm.state = "interrupted";
    } else if (resource.asr_final) {
      fsm.state = "processing";
    } else if (resource.asr_partial) {
      fsm.state = "listening";
    } else {
      fsm.state = "idle";
    }
    return fsm;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createVoiceSession(
  canonicalUserId: UUID,
  channel: string
): VoiceSessionFSM {
  const sessionId = crypto.randomUUID() as SessionId;
  return new VoiceSessionFSM(sessionId, canonicalUserId, channel);
}
