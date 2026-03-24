/**
 * @mss/voice - TTS Integration
 * Whitepaper §4.2.2: Voice Transport Layer
 */

export interface TTSConfig {
  provider: "elevenlabs" | "openai" | "mock";
  apiKey?: string;
  voice?: string;
  model?: string;
}

export interface TTSStream {
  write(text: string): Promise<void>;
  cancel(): void;
}

export interface TTSAdapter {
  connect(sessionId: string): Promise<TTSStream>;
  disconnect(sessionId: string): Promise<void>;
}

export class MockTTSAdapter implements TTSAdapter {
  private activeStreams: Map<string, TTSStream> = new Map();

  async connect(sessionId: string): Promise<TTSStream> {
    const stream: TTSStream = {
      write: async (text: string) => {
        console.log(`[TTS] Mock playing: ${text.slice(0, 50)}...`);
      },
      cancel: () => {
        console.log(`[TTS] Mock cancelled for ${sessionId}`);
      }
    };
    this.activeStreams.set(sessionId, stream);
    return stream;
  }

  async disconnect(sessionId: string): Promise<void> {
    this.activeStreams.delete(sessionId);
  }
}
