/**
 * @mss/voice - ASR Integration
 * Whitepaper §4.2.2: Voice Transport Layer
 */

export interface ASRResult {
  text: string;
  confidence: number;
  is_final: boolean;
}

export interface ASRConfig {
  provider: "deepgram" | "openai" | "mock";
  apiKey?: string;
  model?: string;
}

export interface ASRAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  onTranscript(cb: (result: ASRResult) => void): void;
  onError(cb: (err: Error) => void): void;
}

export class MockASRAdapter implements ASRAdapter {
  private listeners: Array<(r: ASRResult) => void> = [];
  private errorListeners: Array<(e: Error) => void> = [];
  private interval?: ReturnType<typeof setInterval>;

  async start(): Promise<void> {
    console.log("[ASR] Mock adapter started");
  }

  async stop(): Promise<void> {
    if (this.interval) clearInterval(this.interval);
    console.log("[ASR] Mock adapter stopped");
  }

  onTranscript(cb: (r: ASRResult) => void): void {
    this.listeners.push(cb);
  }

  onError(cb: (e: Error) => void): void {
    this.errorListeners.push(cb);
  }

  simulateTranscript(text: string): void {
    const result: ASRResult = { text, confidence: 0.95, is_final: true };
    this.listeners.forEach(l => l(result));
  }
}
