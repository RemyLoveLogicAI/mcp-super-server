/**
 * ElevenLabs TTS Provider
 * 
 * Implements TTS using ElevenLabs API
 * High-quality voice synthesis with streaming support
 */

import type { TTSProvider, TTSOptions, AudioBuffer } from "./types.js";

export interface ElevenLabsConfig {
  /** ElevenLabs API key */
  apiKey: string;
  /** Voice ID (default: Rachel) */
  voiceId?: string;
  /** Model ID (default: eleven_monolingual_v1) */
  modelId?: string;
  /** Stability (0-1) */
  stability?: number;
  /** Similarity boost (0-1) */
  similarityBoost?: number;
}

export class ElevenLabsTTS implements TTSProvider {
  readonly name = "elevenlabs";
  private config: ElevenLabsConfig;
  private baseUrl = "https://api.elevenlabs.io/v1";

  constructor(config: ElevenLabsConfig) {
    this.config = {
      voiceId: "21m00Tcm4TlvDq8ikWAM", // Rachel
      modelId: "eleven_monolingual_v1",
      stability: 0.5,
      similarityBoost: 0.75,
      ...config,
    };
  }

  async synthesize(text: string, options?: TTSOptions): Promise<AudioBuffer> {
    const response = await fetch(
      `${this.baseUrl}/text-to-speech/${this.config.voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.config.apiKey!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: this.config.modelId,
          voice_settings: {
            stability: this.config.stability,
            similarity_boost: this.config.similarityBoost,
          },
          output_format: options?.format === "mp3" ? "mp3_44100_128" : "pcm_24000",
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs API error: ${error}`);
    }

    const audioData = new Uint8Array(await response.arrayBuffer());

    return {
      data: audioData,
      format: options?.format || "mp3",
      sampleRate: options?.format === "mp3" ? 44100 : 24000,
      channels: 1,
      duration_ms: this.estimateDuration(text),
    };
  }

  async *synthesizeStream(textStream: AsyncIterable<string>): AsyncIterable<AudioBuffer> {
    // Accumulate text chunks
    let buffer = "";
    const sentenceEndRegex = /[.!?]+\s*/g;

    for await (const chunk of textStream) {
      buffer += chunk;

      // Check if we have complete sentences
      const sentences = buffer.split(sentenceEndRegex);
      const completeSentences = sentences.slice(0, -1);

      for (const sentence of completeSentences) {
        if (sentence.trim()) {
          yield await this.synthesize(sentence.trim());
        }
      }

      // Keep incomplete sentence in buffer
      buffer = sentences[sentences.length - 1] || "";
    }

    // Synthesize remaining text
    if (buffer.trim()) {
      yield await this.synthesize(buffer.trim());
    }
  }

  /** Stream synthesis using ElevenLabs streaming API */
  async *synthesizeStreaming(text: string): AsyncIterable<AudioBuffer> {
    const response = await fetch(
      `${this.baseUrl}/text-to-speech/${this.config.voiceId}/stream`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.config.apiKey!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: this.config.modelId,
          voice_settings: {
            stability: this.config.stability,
            similarity_boost: this.config.similarityBoost,
          },
          output_format: "pcm_24000",
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs streaming error: ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body from ElevenLabs");
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        yield {
          data: new Uint8Array(value),
          format: "pcm",
          sampleRate: 24000,
          channels: 1,
          duration_ms: (value.length / 2 / 24000) * 1000, // 16-bit PCM
        };
      }
    } finally {
      reader.releaseLock();
    }
  }

  private estimateDuration(text: string): number {
    // Average speaking rate: ~150 words per minute
    // Average word length: ~5 characters
    const wordCount = text.length / 5;
    return (wordCount / 150) * 60 * 1000;
  }
}
