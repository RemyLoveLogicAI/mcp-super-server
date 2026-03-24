/**
 * @mss/voice - WebSocket Audio Server
 * Whitepaper §4.2.2: Voice Transport Layer
 */

import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";

export interface AudioWSConfig {
  port: number;
  onSessionStart?: (sessionId: string, ws: WebSocket) => void;
  onSessionEnd?: (sessionId: string) => void;
  onAudioData?: (sessionId: string, data: Buffer) => void;
}

export class AudioWebSocketServer {
  private wss?: WebSocketServer;
  private sessions: Map<WebSocket, string> = new Map();
  private config: AudioWSConfig;

  constructor(config: AudioWSConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    this.wss = new WebSocketServer({ port: this.config.port });
    
    this.wss.on("connection", (ws: WebSocket) => {
      const sessionId = crypto.randomUUID();
      this.sessions.set(ws, sessionId);
      console.log(`[WS] Client connected: ${sessionId}`);
      
      this.config.onSessionStart?.(sessionId, ws);
      
      ws.on("message", (data) => {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        this.config.onAudioData?.(sessionId, buffer);
      });
      
      ws.on("close", () => {
        console.log(`[WS] Client disconnected: ${sessionId}`);
        this.sessions.delete(ws);
        this.config.onSessionEnd?.(sessionId);
      });
      
      ws.on("error", (err: Error) => {
        console.error(`[WS] Error for ${sessionId}:`, err);
      });
    });
    
    console.log(`[WS] Audio server listening on port ${this.config.port}`);
  }

  async stop(): Promise<void> {
    for (const [ws] of this.sessions) {
      ws.close();
    }
    this.wss?.close();
  }

  sendToClient(ws: WebSocket, message: object): void {
    ws.send(JSON.stringify(message));
  }

  broadcast(message: object): void {
    for (const [ws] of this.sessions) {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(JSON.stringify(message));
      }
    }
  }
}
