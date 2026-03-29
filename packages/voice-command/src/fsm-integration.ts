/**
 * @mss/voice-command - FSM Integration
 * Hooks voice-command into VoiceSessionFSM
 */

import { VoiceSessionFSM, type VoiceFSMState } from "@mss/voice";
import { VoiceCommandIntentSchema, type VoiceCommandIntent } from "./types";
import type { ExecutorEvent } from "./executor";
import { VoiceCommandContextManager } from "./context";

// ============================================================================
// FSM Integration Events
// ============================================================================

export type FSMIntegrationEvent =
  | { type: "voice_command_received"; transcript: string }
  | { type: "intent_resolved"; intent: VoiceCommandIntent }
  | { type: "tool_call_emitted"; tool_id: string }
  | { type: "tool_call_completed"; tool_id: string; success: boolean }
  | { type: "barge_in_handled" }
  | { type: "confirmation_requested"; description: string }
  | { type: "confirmation_received"; confirmed: boolean }
  | { type: "response_ready"; text: string };

// ============================================================================
// FSM Integration Handler
// ============================================================================

export type FSMIntegrationEventHandler = (event: FSMIntegrationEvent) => void;

export class FSMIntegration {
  private fsm: VoiceSessionFSM | null = null;
  private context: VoiceCommandContextManager | null = null;
  private eventHandlers: Set<FSMIntegrationEventHandler>;
  private toolCallId: string | null = null;

  constructor() {
    this.eventHandlers = new Set();
  }

  /**
   * Attach to a VoiceSessionFSM instance
   */
  attach(fsm: VoiceSessionFSM, context: VoiceCommandContextManager): void {
    this.fsm = fsm;
    this.context = context;
  }

  /**
   * Detach from the FSM
   */
  detach(): void {
    this.fsm = null;
    this.context = null;
  }

  /**
   * Subscribe to integration events
   */
  onEvent(handler: FSMIntegrationEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Emit an event to all handlers
   */
  private emit(event: FSMIntegrationEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }

  /**
   * Handle incoming transcript from ASR
   */
  handleTranscript(text: string): void {
    if (!this.fsm) return;

    this.emit({ type: "voice_command_received", transcript: text });

    // Update FSM context
    if (this.context) {
      this.context.setFsmState(this.fsm.getState());
    }

    // Send ASR_FINAL event to FSM
    const transition = this.fsm.transition({ type: "ASR_FINAL", text });
    this.executeEffects(transition.effects);
  }

  /**
   * Handle intent resolution
   */
  handleIntentResolved(intent: VoiceCommandIntent): void {
    if (!this.fsm) return;

    this.emit({ type: "intent_resolved", intent });

    // Send INTENT_RESOLVED event to FSM
    const transition = this.fsm.transition({
      type: "INTENT_RESOLVED",
      intent: intent as unknown as Record<string, unknown>,
    });
    this.executeEffects(transition.effects);
  }

  /**
   * Handle tool call start
   */
  handleToolCallStart(toolId: string): void {
    if (!this.fsm) return;

    this.toolCallId = toolId;
    this.emit({ type: "tool_call_emitted", tool_id: toolId });

    // Emit TOOL_CALL_START event to FSM
    const transition = this.fsm.transition({
      type: "TOOL_CALL_START",
      tool_call_id: toolId,
    });
    this.executeEffects(transition.effects);
  }

  /**
   * Handle tool call completion
   */
  handleToolCallComplete(success: boolean): void {
    if (!this.fsm || !this.toolCallId) return;

    this.emit({
      type: "tool_call_completed",
      tool_id: this.toolCallId,
      success,
    });

    // Emit TOOL_CALL_COMPLETE event to FSM
    const transition = this.fsm.transition({
      type: "TOOL_CALL_COMPLETE",
      tool_call_id: this.toolCallId,
      success,
    });
    this.executeEffects(transition.effects);
    this.toolCallId = null;
  }

  /**
   * Handle barge-in interrupt
   */
  handleBargeIn(): void {
    if (!this.fsm) return;

    this.emit({ type: "barge_in_handled" });

    // Send BARGE_IN event to FSM
    const transition = this.fsm.transition({ type: "BARGE_IN" });
    this.executeEffects(transition.effects);
  }

  /**
   * Handle confirmation request
   */
  handleConfirmationRequested(description: string): void {
    this.emit({ type: "confirmation_requested", description });
  }

  /**
   * Handle confirmation response
   */
  handleConfirmationReceived(confirmed: boolean): void {
    this.emit({ type: "confirmation_received", confirmed });
  }

  /**
   * Handle response ready to speak
   */
  handleResponseReady(text: string): void {
    this.emit({ type: "response_ready", text });

    if (!this.fsm) return;

    // Start TTS
    const transition = this.fsm.transition({ type: "TTS_START" });
    this.executeEffects(transition.effects);
  }

  /**
   * Handle TTS complete
   */
  handleTTSComplete(): void {
    if (!this.fsm) return;

    const transition = this.fsm.transition({ type: "TTS_COMPLETE" });
    this.executeEffects(transition.effects);
  }

  /**
   * Get current FSM state
   */
  getFSMState(): VoiceFSMState | null {
    return this.fsm?.getState() ?? null;
  }

  /**
   * Check if currently processing
   */
  isProcessing(): boolean {
    const state = this.getFSMState();
    return state === "processing" || state === "listening";
  }

  /**
   * Execute FSM effects
   */
  private executeEffects(effects: { type: string; [key: string]: unknown }[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case "cancel_tts":
          // Cancel any ongoing TTS
          break;
        case "cancel_pending_tools":
          // Cancel any pending tool calls
          break;
        case "emit_tool_canceled":
          this.emit({
            type: "tool_call_completed",
            tool_id: effect.tool_call_id as string,
            success: false,
          });
          break;
        case "emit_turn_started":
          // New turn started
          break;
        case "emit_turn_finalized":
          // Turn finalized
          break;
        case "log":
          // Log message
          console.log(`[FSM] ${effect.message}`);
          break;
        case "start_silence_timer":
        case "clear_timers":
          // Handle timers
          break;
      }
    }
  }
}

// ============================================================================
// Executor to FSM Bridge
// ============================================================================

export class ExecutorToFSMBridge {
  private fsmIntegration: FSMIntegration;

  constructor(fsmIntegration: FSMIntegration) {
    this.fsmIntegration = fsmIntegration;
  }

  /**
   * Create a handler that bridges executor events to FSM
   */
  createExecutorEventHandler(): (event: ExecutorEvent) => void {
    return (event: ExecutorEvent) => {
      switch (event.type) {
        case "tool_call_started":
          if (event.tool_call_id) {
            this.fsmIntegration.handleToolCallStart(event.tool_call_id);
          }
          break;
        case "tool_call_completed":
          this.fsmIntegration.handleToolCallComplete(true);
          break;
        case "tool_call_failed":
          this.fsmIntegration.handleToolCallComplete(false);
          break;
        case "execution_cancelled":
          // Handle cancellation
          break;
      }
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createFSMIntegration(): FSMIntegration {
  return new FSMIntegration();
}
