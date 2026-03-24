/**
 * OpenAI Whisper ASR Provider
 * 
 * Implements ASR using OpenAI's Whisper API
 * Supports both standard and streaming transcription
 */

import type { ASRProvider, ASRResult, ASRPartialResult, AudioBuffer } from "./types.js";

export interface WhisperConfig {
  /** OpenAI API key */
  apiKey: string;
  /** Model to use (default: whisper-1) */
  model?: string;
  /** Language hint (optional) */
  language?: string;
  /** Response format */
  responseFormat?: "json" | "text" | "srt" | "verbose_json" | "vtt";
}

export class WhisperASR implements ASRProvider {
  readonly name = "whisper";
  private config: WhisperConfig;

  constructor(config: WhisperConfig) {
    this.config = {
      model: "whisper-1",
      responseFormat: "json",
      ...config,
    };
  }

  async transcribe(audio: AudioBuffer): Promise<ASRResult> {
    const formData = new FormData();
    
    // Convert AudioBuffer to Blob
    const blob = new Blob([audio.data.buffer as ArrayBuffer], {
      type: this.getMimeType(audio.format)
    });
    
    formData.append("file", blob, `audio.${audio.format}`);
    formData.append("model", this.config.model!);
    
    if (this.config.language) {
      formData.append("language", this.config.language);
    }
    
    formData.append("response_format", this.config.responseFormat!);

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.config.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Whisper API error: ${error}`);
    }

    const result = await response.json();

    return {
      text: result.text || "",
      confidence: this.extractConfidence(result),
      language: result.language,
      duration_ms: audio.duration_ms,
      is_final: true,
    };
  }

  async *transcribeStream(audioStream: ReadableStream<AudioBuffer>): AsyncIterable<ASRPartialResult> {
    // Whisper doesn't support true streaming, so we simulate it
    // by buffering and sending chunks
    const reader = audioStream.getReader();
    const chunks: AudioBuffer[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        
        // Every ~3 seconds of audio, send for transcription
        const totalDuration = chunks.reduce((sum, c) => sum + c.duration_ms, 0);
        if (totalDuration >= 3000) {
          const combined = this.combineAudioBuffers(chunks);
          const result = await this.transcribe(combined);
          
          yield {
            text: result.text,
            confidence: result.confidence,
            is_final: false,
          };
          
          chunks.length = 0;
        }
      }

      // Final transcription
      if (chunks.length > 0) {
        const combined = this.combineAudioBuffers(chunks);
        const result = await this.transcribe(combined);
        
        yield {
          text: result.text,
          confidence: result.confidence,
          is_final: true,
        };
      }
    } finally {
      reader.releaseLock();
    }
  }

  private getMimeType(format: string): string {
    const mimeTypes: Record<string, string> = {
      mp3: "audio/mpeg",
      wav: "audio/wav",
      ogg: "audio/ogg",
      pcm: "audio/pcm",
    };
    return mimeTypes[format] || "audio/wav";
  }

  private extractConfidence(result: Record<string, unknown>): number {
    // Whisper doesn't provide confidence scores directly
    // We estimate based on segments if available
    const segments = result.segments as Array<{ avg_logprob: number }> | undefined;
    if (segments && segments.length > 0) {
      const avgLogProb = segments.reduce((sum, s) => sum + s.avg_logprob, 0) / segments.length;
      // Convert log probability to approximate confidence (0-1)
      return Math.min(1, Math.max(0, 1 + avgLogProb));
    }
    return 0.9; // Default high confidence
  }

  private combineAudioBuffers(buffers: AudioBuffer[]): AudioBuffer {
    const totalLength = buffers.reduce((sum, b) => sum + b.data.length, 0);
    const combined = new Uint8Array(totalLength);
    
    let offset = 0;
    for (const buffer of buffers) {
      combined.set(buffer.data, offset);
      offset += buffer.data.length;
    }

    const first = buffers[0]!;
    return {
      data: combined,
      format: first.format,
      sampleRate: first.sampleRate,
      channels: first.channels,
      duration_ms: buffers.reduce((sum, b) => sum + b.duration_ms, 0),
    };
  }
}
