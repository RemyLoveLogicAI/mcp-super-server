/**
 * Voice Provider Types
 * Whitepaper §4.2.2: Voice Transport Layer
 * 
 * Abstraction layer for ASR and TTS providers
 */

// ASR (Speech-to-Text) Types
export interface ASRProvider {
  /** Provider name */
  readonly name: string;

  /** Transcribe audio to text */
  transcribe(audio: AudioBuffer): Promise<ASRResult>;

  /** Stream transcription for real-time ASR */
  transcribeStream?(audioStream: ReadableStream<AudioBuffer>): AsyncIterable<ASRPartialResult>;
}

export interface ASRResult {
  text: string;
  confidence: number;
  language?: string;
  duration_ms: number;
  is_final: boolean;
}

export interface ASRPartialResult {
  text: string;
  confidence: number;
  is_final: boolean;
}

// TTS (Text-to-Speech) Types
export interface TTSProvider {
  /** Provider name */
  readonly name: string;

  /** Synthesize text to speech */
  synthesize(text: string, options?: TTSOptions): Promise<AudioBuffer>;

  /** Stream synthesis for real-time TTS */
  synthesizeStream?(textStream: AsyncIterable<string>): AsyncIterable<AudioBuffer>;
}

export interface TTSOptions {
  voice?: string;
  speed?: number;
  pitch?: number;
  format?: "mp3" | "wav" | "ogg";
}

// Audio Types
export interface AudioBuffer {
  data: Uint8Array;
  format: "mp3" | "wav" | "ogg" | "pcm";
  sampleRate: number;
  channels: number;
  duration_ms: number;
}

// Voice Session with Providers
export interface VoiceSessionConfig {
  asr?: ASRProvider;
  tts?: TTSProvider;
  autoListen?: boolean;
  silenceTimeoutMs?: number;
}

// Provider Factory
export interface VoiceProviderFactory {
  createASR(config: unknown): ASRProvider;
  createTTS(config: unknown): TTSProvider;
}
