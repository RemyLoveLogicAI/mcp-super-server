/**
 * @mss/voice - Effect Executor
 * Whitepaper §4.2.2 + §5 Pillar 1
 *
 * Executes side effects from FSM transitions.
 * Bridges FSM to event ledger and external systems.
 */

import { EventLedger } from "@mss/core/contracts/ledger";
import {
  VoiceTurnStarted,
  VoiceTurnFinalized,
} from "@mss/core/events/voice";
import { ToolCallCanceled } from "@mss/core/events/tools";
import {
  UUID,
  SessionId,
  TurnId,
  EventId,
  ToolCallId,
} from "@mss/core/ids";
import { VoiceFSMEffect, VoiceFSMContext } from "./fsm.js";

// ============================================================================
// Types
// ============================================================================

export interface TTSController {
  cancel(): Promise<void>;
}

export interface ToolExecutor {
  cancelAll(): Promise<ToolCallId[]>;
  cancel(toolCallId: ToolCallId): Promise<boolean>;
}

export interface EffectExecutorDeps {
  ledger: EventLedger;
  tts?: TTSController;
  toolExecutor?: ToolExecutor;
  logger?: (message: string) => void;
}

export interface TimerHandle {
  id: string;
  cancel(): void;
}

export interface EffectExecutorState {
  activeTimers: Map<string, TimerHandle>;
}

// ============================================================================
// Effect Executor
// ============================================================================

export class VoiceEffectExecutor {
  private deps: EffectExecutorDeps;
  private state: EffectExecutorState;
  private onTimeout?: (timerId: string) => void;

  constructor(deps: EffectExecutorDeps) {
    this.deps = deps;
    this.state = {
      activeTimers: new Map(),
    };
  }

  /**
   * Set callback for timeout events.
   */
  setTimeoutCallback(callback: (timerId: string) => void): void {
    this.onTimeout = callback;
  }

  /**
   * Execute a batch of effects from an FSM transition.
   */
  async execute(
    effects: VoiceFSMEffect[],
    context: VoiceFSMContext
  ): Promise<void> {
    for (const effect of effects) {
      await this.executeOne(effect, context);
    }
  }

  /**
   * Execute a single effect.
   */
  private async executeOne(
    effect: VoiceFSMEffect,
    context: VoiceFSMContext
  ): Promise<void> {
    switch (effect.type) {
      case "emit_turn_started":
        await this.emitTurnStarted(context, effect.turn_id);
        break;

      case "emit_turn_finalized":
        await this.emitTurnFinalized(context, effect.turn_id, effect.asr_final, effect.intent);
        break;

      case "emit_tool_canceled":
        await this.emitToolCanceled(context, effect.tool_call_id, effect.reason);
        break;

      case "cancel_tts":
        await this.cancelTTS();
        break;

      case "cancel_pending_tools":
        await this.cancelPendingTools();
        break;

      case "start_silence_timer":
        this.startTimer(`silence_${context.current_turn_id}`, effect.duration_ms);
        break;

      case "clear_timers":
        this.clearAllTimers();
        break;

      case "log":
        this.log(effect.message);
        break;
    }
  }

  // --------------------------------------------------------------------------
  // Event Emission
  // --------------------------------------------------------------------------

  private async emitTurnStarted(
    context: VoiceFSMContext,
    turnId: TurnId
  ): Promise<void> {
    const event: VoiceTurnStarted = {
      event_id: crypto.randomUUID() as EventId,
      event_type: "VoiceTurnStarted",
      timestamp: new Date().toISOString(),
      actor: { canonical_user_id: context.canonical_user_id as string },
      session_id: context.session_id,
      turn_id: turnId,
      channel: context.channel,
    };

    await this.deps.ledger.append(event);
    this.log(`Turn ${turnId} started for session ${context.session_id}`);
  }

  private async emitTurnFinalized(
    context: VoiceFSMContext,
    turnId: TurnId,
    asrFinal: string,
    intent?: Record<string, unknown>
  ): Promise<void> {
    const event: VoiceTurnFinalized = {
      event_id: crypto.randomUUID() as EventId,
      event_type: "VoiceTurnFinalized",
      timestamp: new Date().toISOString(),
      actor: { canonical_user_id: context.canonical_user_id as string },
      session_id: context.session_id,
      turn_id: turnId,
      asr_final: asrFinal,
      was_interrupted: context.interrupt_flag,
    };
    if (intent !== undefined) event.intent = intent;

    await this.deps.ledger.append(event);
    this.log(`Turn ${turnId} finalized: "${asrFinal.slice(0, 50)}..."`);
  }

  private async emitToolCanceled(
    context: VoiceFSMContext,
    toolCallId: ToolCallId,
    reason: string
  ): Promise<void> {
    const event: ToolCallCanceled = {
      event_id: crypto.randomUUID() as EventId,
      event_type: "ToolCallCanceled",
      timestamp: new Date().toISOString(),
      actor: { system: true },
      tool_call_id: toolCallId,
      reason,
      partial_execution: false,
    };

    await this.deps.ledger.append(event);
    this.log(`Tool call ${toolCallId} canceled: ${reason}`);
  }

  // --------------------------------------------------------------------------
  // TTS Control
  // --------------------------------------------------------------------------

  private async cancelTTS(): Promise<void> {
    if (this.deps.tts) {
      await this.deps.tts.cancel();
      this.log("TTS canceled");
    }
  }

  // --------------------------------------------------------------------------
  // Tool Cancellation
  // --------------------------------------------------------------------------

  private async cancelPendingTools(): Promise<void> {
    if (this.deps.toolExecutor) {
      const canceled = await this.deps.toolExecutor.cancelAll();
      this.log(`Canceled ${canceled.length} pending tool calls`);
    }
  }

  // --------------------------------------------------------------------------
  // Timer Management
  // --------------------------------------------------------------------------

  private startTimer(id: string, durationMs: number): void {
    // Cancel existing timer with same ID
    const existing = this.state.activeTimers.get(id);
    if (existing) {
      existing.cancel();
    }

    const timeoutId = setTimeout(() => {
      this.state.activeTimers.delete(id);
      if (this.onTimeout) {
        this.onTimeout(id);
      }
    }, durationMs);

    const handle: TimerHandle = {
      id,
      cancel: () => clearTimeout(timeoutId),
    };

    this.state.activeTimers.set(id, handle);
    this.log(`Timer ${id} started for ${durationMs}ms`);
  }

  private clearAllTimers(): void {
    for (const [id, handle] of this.state.activeTimers) {
      handle.cancel();
      this.log(`Timer ${id} cleared`);
    }
    this.state.activeTimers.clear();
  }

  // --------------------------------------------------------------------------
  // Logging
  // --------------------------------------------------------------------------

  private log(message: string): void {
    if (this.deps.logger) {
      this.deps.logger(`[VoiceFSM] ${message}`);
    }
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  /**
   * Clean up all resources.
   */
  dispose(): void {
    this.clearAllTimers();
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createEffectExecutor(deps: EffectExecutorDeps): VoiceEffectExecutor {
  return new VoiceEffectExecutor(deps);
}
