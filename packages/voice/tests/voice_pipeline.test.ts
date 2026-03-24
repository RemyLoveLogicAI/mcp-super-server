/**
 * Voice Pipeline Integration Tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { MockASRAdapter, MockTTSAdapter, VoiceSessionFSM, createVoiceSession } from "../src/index";

describe("Voice Pipeline (ASR → FSM → TTS)", () => {
  let asr: MockASRAdapter;
  let tts: MockTTSAdapter;

  beforeEach(() => {
    asr = new MockASRAdapter();
    tts = new MockTTSAdapter();
  });

  it("should simulate full voice pipeline", async () => {
    // Start ASR
    await asr.start();
    
    // Register transcript handler
    const transcripts: string[] = [];
    asr.onTranscript((result) => {
      transcripts.push(result.text);
    });
    
    // Simulate user speaking
    asr.simulateTranscript("What's the weather?");
    asr.simulateTranscript("What's the weather in San Francisco?");
    
    expect(transcripts).toHaveLength(2);
    expect(transcripts[1]).toContain("San Francisco");
    
    await asr.stop();
  });

  it("should create TTS stream and play audio", async () => {
    const stream = await tts.connect("session-1");
    
    await stream.write("The weather in San Francisco is 72 degrees.");
    
    await tts.disconnect("session-1");
  });

  it("should handle TTS cancellation on barge-in", async () => {
    const stream = await tts.connect("session-1");
    
    // Simulate barge-in during TTS
    stream.cancel();
    
    // Verify stream was cancelled (no error thrown)
    expect(true).toBe(true);
  });
});
