/**
 * @mss/voice - Voice FSM Unit Tests
 * Tests for VoiceSessionFSM state machine
 */

import { describe, it, beforeEach, expect } from "vitest";
import {
  VoiceSessionFSM,
  VoiceFSMState,
  VoiceFSMEvent,
  VoiceFSMEffect,
  createVoiceSession,
} from "../src/fsm";
import { generateCanonicalUserId, generateSessionId } from "@mss/core/testing";
import type { UUID, SessionId, ToolCallId } from "@mss/core/ids";

describe("VoiceSessionFSM", () => {
  let fsm: VoiceSessionFSM;
  let userId: UUID;

  beforeEach(() => {
    userId = generateCanonicalUserId();
    fsm = createVoiceSession(userId, "test-channel");
  });

  describe("initial state", () => {
    it("should start in idle state", () => {
      expect(fsm.getState()).toBe("idle");
    });

    it("should have turn_id 0", () => {
      expect(fsm.getContext().current_turn_id).toBe(0);
    });

    it("should not have pending tool calls", () => {
      expect(fsm.hasPendingToolCalls()).toBe(false);
    });

    it("should not be speaking", () => {
      expect(fsm.isSpeaking()).toBe(false);
    });
  });

  describe("idle -> listening transition", () => {
    it("should transition on AUDIO_START", () => {
      const result = fsm.transition({ type: "AUDIO_START" });

      expect(result.next_state).toBe("listening");
      expect(fsm.getState()).toBe("listening");
    });

    it("should increment turn_id", () => {
      fsm.transition({ type: "AUDIO_START" });

      expect(fsm.getContext().current_turn_id).toBe(1);
    });

    it("should emit turn_started effect", () => {
      const result = fsm.transition({ type: "AUDIO_START" });

      const turnStarted = result.effects.find((e) => e.type === "emit_turn_started");
      expect(turnStarted).toBeTruthy();
    });

    it("should start silence timer", () => {
      const result = fsm.transition({ type: "AUDIO_START" });

      const timer = result.effects.find((e) => e.type === "start_silence_timer");
      expect(timer).toBeTruthy();
    });
  });

  describe("listening state", () => {
    beforeEach(() => {
      fsm.transition({ type: "AUDIO_START" });
    });

    it("should update asr_partial", () => {
      fsm.transition({ type: "ASR_PARTIAL", text: "hello" });

      expect(fsm.getContext().asr_partial).toBe("hello");
      expect(fsm.getState()).toBe("listening");
    });

    it("should transition to processing on ASR_FINAL", () => {
      const result = fsm.transition({ type: "ASR_FINAL", text: "hello world" });

      expect(result.next_state).toBe("processing");
      expect(fsm.getContext().asr_final).toBe("hello world");
      expect(fsm.getContext().asr_partial).toBe("");
    });

    it("should transition to processing on AUDIO_END with partial", () => {
      fsm.transition({ type: "ASR_PARTIAL", text: "hello" });
      const result = fsm.transition({ type: "AUDIO_END" });

      expect(result.next_state).toBe("processing");
    });

    it("should return to idle on AUDIO_END without speech", () => {
      const result = fsm.transition({ type: "AUDIO_END" });

      expect(result.next_state).toBe("idle");
    });

    it("should handle timeout", () => {
      fsm.transition({ type: "ASR_PARTIAL", text: "partial" });
      const result = fsm.transition({ type: "TIMEOUT" });

      expect(result.next_state).toBe("idle");
      const finalized = result.effects.find((e) => e.type === "emit_turn_finalized");
      expect(finalized).toBeTruthy();
    });
  });

  describe("processing state", () => {
    beforeEach(() => {
      fsm.transition({ type: "AUDIO_START" });
      fsm.transition({ type: "ASR_FINAL", text: "test utterance" });
    });

    it("should be in processing state", () => {
      expect(fsm.getState()).toBe("processing");
    });

    it("should track tool calls", () => {
      fsm.transition({ type: "TOOL_CALL_START", tool_call_id: "tool-1" });

      expect(fsm.hasPendingToolCalls()).toBe(true);
      expect(fsm.getContext().pending_tool_calls.has("tool-1" as ToolCallId)).toBe(true);
    });

    it("should remove completed tool calls", () => {
      fsm.transition({ type: "TOOL_CALL_START", tool_call_id: "tool-1" });
      fsm.transition({ type: "TOOL_CALL_COMPLETE", tool_call_id: "tool-1", success: true });

      expect(fsm.hasPendingToolCalls()).toBe(false);
    });

    it("should transition to speaking on TTS_START", () => {
      const result = fsm.transition({ type: "TTS_START" });

      expect(result.next_state).toBe("speaking");
      expect(fsm.isSpeaking()).toBe(true);
    });

    it("should emit turn_finalized on INTENT_RESOLVED", () => {
      const result = fsm.transition({
        type: "INTENT_RESOLVED",
        intent: { action: "test" },
      });

      expect(fsm.getContext().intent).toEqual({ action: "test" });
      const finalized = result.effects.find((e) => e.type === "emit_turn_finalized");
      expect(finalized).toBeTruthy();
    });
  });

  describe("speaking state", () => {
    beforeEach(() => {
      fsm.transition({ type: "AUDIO_START" });
      fsm.transition({ type: "ASR_FINAL", text: "test" });
      fsm.transition({ type: "TTS_START" });
    });

    it("should be speaking", () => {
      expect(fsm.getState()).toBe("speaking");
      expect(fsm.isSpeaking()).toBe(true);
    });

    it("should return to idle on TTS_COMPLETE", () => {
      const result = fsm.transition({ type: "TTS_COMPLETE" });

      expect(result.next_state).toBe("idle");
      expect(fsm.isSpeaking()).toBe(false);
    });

    it("should handle barge-in via AUDIO_START", () => {
      // Add a pending tool call
      fsm.transition({ type: "TOOL_CALL_START", tool_call_id: "tool-1" });

      const result = fsm.transition({ type: "AUDIO_START" });

      expect(result.next_state).toBe("interrupted");
      expect(fsm.wasInterrupted()).toBe(true);
    });

    it("should cancel TTS on barge-in", () => {
      const result = fsm.transition({ type: "AUDIO_START" });

      const cancelTTS = result.effects.find((e) => e.type === "cancel_tts");
      expect(cancelTTS).toBeTruthy();
    });

    it("should cancel pending tools on barge-in", () => {
      fsm.transition({ type: "TOOL_CALL_START", tool_call_id: "tool-1" });
      const result = fsm.transition({ type: "AUDIO_START" });

      const cancelTools = result.effects.find((e) => e.type === "cancel_pending_tools");
      expect(cancelTools).toBeTruthy();
    });

    it("should emit ToolCallCanceled for each pending tool on barge-in", () => {
      fsm.transition({ type: "TOOL_CALL_START", tool_call_id: "tool-1" });
      fsm.transition({ type: "TOOL_CALL_START", tool_call_id: "tool-2" });

      const result = fsm.transition({ type: "AUDIO_START" });

      const canceledEffects = result.effects.filter(
        (e) => e.type === "emit_tool_canceled"
      );
      expect(canceledEffects).toHaveLength(2);
    });

    it("should start new turn on barge-in", () => {
      const prevTurnId = fsm.getContext().current_turn_id;
      const result = fsm.transition({ type: "AUDIO_START" });

      expect(fsm.getContext().current_turn_id).toBe(prevTurnId + 1);
      const turnStarted = result.effects.find((e) => e.type === "emit_turn_started");
      expect(turnStarted).toBeTruthy();
    });

    it("should clear pending tools after barge-in", () => {
      fsm.transition({ type: "TOOL_CALL_START", tool_call_id: "tool-1" });
      fsm.transition({ type: "AUDIO_START" });

      expect(fsm.hasPendingToolCalls()).toBe(false);
    });
  });

  describe("interrupted state", () => {
    beforeEach(() => {
      fsm.transition({ type: "AUDIO_START" });
      fsm.transition({ type: "ASR_FINAL", text: "test" });
      fsm.transition({ type: "TTS_START" });
      fsm.transition({ type: "AUDIO_START" }); // Barge-in
    });

    it("should be in interrupted state", () => {
      expect(fsm.getState()).toBe("interrupted");
    });

    it("should have interrupt flag set", () => {
      expect(fsm.wasInterrupted()).toBe(true);
    });

    it("should transition to listening on ASR_PARTIAL", () => {
      const result = fsm.transition({ type: "ASR_PARTIAL", text: "new" });

      expect(result.next_state).toBe("listening");
    });

    it("should transition to processing on ASR_FINAL", () => {
      const result = fsm.transition({ type: "ASR_FINAL", text: "new utterance" });

      expect(result.next_state).toBe("processing");
    });

    it("should return to idle on timeout", () => {
      const result = fsm.transition({ type: "TIMEOUT" });

      expect(result.next_state).toBe("idle");
      expect(fsm.wasInterrupted()).toBe(false);
    });
  });

  describe("RESET event", () => {
    it("should return to idle from any state", () => {
      // From listening
      fsm.transition({ type: "AUDIO_START" });
      expect(fsm.getState()).toBe("listening");
      fsm.transition({ type: "RESET" });
      expect(fsm.getState()).toBe("idle");

      // From processing
      fsm.transition({ type: "AUDIO_START" });
      fsm.transition({ type: "ASR_FINAL", text: "test" });
      expect(fsm.getState()).toBe("processing");
      fsm.transition({ type: "RESET" });
      expect(fsm.getState()).toBe("idle");

      // From speaking
      fsm.transition({ type: "AUDIO_START" });
      fsm.transition({ type: "ASR_FINAL", text: "test" });
      fsm.transition({ type: "TTS_START" });
      expect(fsm.getState()).toBe("speaking");
      fsm.transition({ type: "RESET" });
      expect(fsm.getState()).toBe("idle");
    });

    it("should clear timers", () => {
      fsm.transition({ type: "AUDIO_START" });
      const result = fsm.transition({ type: "RESET" });

      const clearTimers = result.effects.find((e) => e.type === "clear_timers");
      expect(clearTimers).toBeTruthy();
    });
  });

  describe("invalid transitions", () => {
    it("should log and stay in state on invalid event", () => {
      // BARGE_IN in idle makes no sense
      const result = fsm.transition({ type: "BARGE_IN" });

      expect(result.next_state).toBe("idle");
      const logEffect = result.effects.find((e) => e.type === "log");
      expect(logEffect).toBeTruthy();
    });
  });

  describe("toResource / fromResource", () => {
    it("should serialize to resource", () => {
      fsm.transition({ type: "AUDIO_START" });
      fsm.transition({ type: "ASR_PARTIAL", text: "partial" });

      const resource = fsm.toResource();

      expect(resource.session_id).toBeTruthy();
      expect(resource.canonical_user_id).toBe(userId);
      expect(resource.channel).toBe("test-channel");
      expect(resource.asr_partial).toBe("partial");
    });

    it("should restore from resource", () => {
      fsm.transition({ type: "AUDIO_START" });
      fsm.transition({ type: "ASR_FINAL", text: "test" });
      fsm.transition({ type: "TTS_START" });

      const resource = fsm.toResource();
      const restored = VoiceSessionFSM.fromResource(resource);

      expect(restored.getState()).toBe("speaking");
      expect(restored.getContext().asr_final).toBe("test");
      expect(restored.isSpeaking()).toBe(true);
    });
  });
});

describe("createVoiceSession", () => {
  it("should create a new session with generated ID", () => {
    const userId = generateCanonicalUserId();
    const fsm = createVoiceSession(userId, "discord");

    expect(fsm.getContext().session_id).toBeTruthy();
    expect(fsm.getContext().canonical_user_id).toBe(userId);
    expect(fsm.getContext().channel).toBe("discord");
  });
});
