/**
 * @mss/gateway - Channel Adapters
 * Whitepaper §4.2.1
 * 
 * Gateway layer handles:
 * - Channel protocol translation (Discord, Telegram, etc.)
 * - Transport termination
 * - Event normalization to CoreEvent
 */

export const version = "0.0.1";

// Import and re-export core types
import type { CoreEvent } from "@mss/core/events";
import type { EventId } from "@mss/core";
import { VoiceTurnStarted, VoiceTurnFinalized } from "@mss/core/events";

// Re-export CoreEvent
export type { CoreEvent } from "@mss/core/events";

// ─────────────────────────────────────────────────────────────────────────────
// Helper to build a complete CoreEvent with required base fields
// ─────────────────────────────────────────────────────────────────────────────

function buildVoiceTurnStarted(params: {
  session_id: string;
  turn_id: number;
  channel: string;
  actor: { canonical_user_id?: string; platform?: string };
}): VoiceTurnStarted {
  const base = {
    event_id: crypto.randomUUID() as EventId,
    event_type: "VoiceTurnStarted" as const,
    timestamp: new Date().toISOString(),
    actor: {
      canonical_user_id: params.actor.canonical_user_id,
      platform: params.actor.platform,
    },
    prev_hash: undefined,
    hash: undefined,
  };
  return VoiceTurnStarted.parse({
    ...base,
    session_id: params.session_id,
    turn_id: params.turn_id,
    channel: params.channel,
  });
}

function buildVoiceTurnFinalized(params: {
  session_id: string;
  turn_id: number;
  asr_final: string;
  actor: { canonical_user_id?: string; platform?: string };
}): VoiceTurnFinalized {
  const base = {
    event_id: crypto.randomUUID() as EventId,
    event_type: "VoiceTurnFinalized" as const,
    timestamp: new Date().toISOString(),
    actor: {
      canonical_user_id: params.actor.canonical_user_id,
      platform: params.actor.platform,
    },
    prev_hash: undefined,
    hash: undefined,
  };
  return VoiceTurnFinalized.parse({
    ...base,
    session_id: params.session_id,
    turn_id: params.turn_id,
    asr_final: params.asr_final,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface ChannelAdapter {
  /** Platform name */
  readonly platform: SupportedPlatform;
  
  /** Initialize the adapter */
  initialize(): Promise<void>;
  
  /** Handle incoming event from platform */
  handleEvent(event: PlatformEvent): Promise<CoreEvent[]>;
  
  /** Send event to platform */
  sendEvent(coreEvent: CoreEvent): Promise<void>;
  
  /** Teardown */
  destroy(): Promise<void>;
}

export type SupportedPlatform = 
  | "discord" 
  | "telegram" 
  | "whatsapp" 
  | "slack"
  | "r1"
  | "humane_pin"
  | "web"
  | "mobile";

export interface PlatformEvent {
  platform: SupportedPlatform;
  timestamp: string;
  actor: {
    platform_user_id: string;
    platform_username?: string;
  };
  type: string;
  payload: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Discord Adapter
// ─────────────────────────────────────────────────────────────────────────────

export class DiscordAdapter implements ChannelAdapter {
  readonly platform = "discord" as const;
  private token?: string;
  private turnCounter = 0;
  
  async initialize(): Promise<void> {
    // TODO: Initialize Discord client
    console.log("[Discord] Initializing adapter");
  }
  
  async handleEvent(event: PlatformEvent): Promise<CoreEvent[]> {
    // Normalize Discord events to CoreEvent
    const events: CoreEvent[] = [];
    const sessionId = `discord-${event.actor.platform_user_id}`;
    const actor = {
      canonical_user_id: event.actor.platform_user_id,
      platform: "discord",
    };
    
    switch (event.type) {
      case "message_create":
        if (this.isVoiceChannel(event.payload)) {
          events.push(
            buildVoiceTurnStarted({
              session_id: sessionId,
              turn_id: this.turnCounter++,
              channel: "discord",
              actor,
            })
          );
        }
        break;
        
      case "message_update":
        if (event.payload.content) {
          events.push(
            buildVoiceTurnFinalized({
              session_id: sessionId,
              turn_id: this.turnCounter,
              asr_final: event.payload.content as string,
              actor,
            })
          );
        }
        break;
    }
    
    return events;
  }
  
  async sendEvent(coreEvent: CoreEvent): Promise<void> {
    // TODO: Send CoreEvent back to Discord
    console.log("[Discord] Sending event:", coreEvent.event_type);
  }
  
  async destroy(): Promise<void> {
    console.log("[Discord] Destroying adapter");
  }
  
  private isVoiceChannel(payload: Record<string, unknown>): boolean {
    return payload.guild_id !== undefined && payload.member !== undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Telegram Adapter
// ─────────────────────────────────────────────────────────────────────────────

export class TelegramAdapter implements ChannelAdapter {
  readonly platform = "telegram" as const;
  private token?: string;
  private turnCounter = 0;
  
  async initialize(): Promise<void> {
    console.log("[Telegram] Initializing adapter");
  }
  
  async handleEvent(event: PlatformEvent): Promise<CoreEvent[]> {
    const events: CoreEvent[] = [];
    const sessionId = `telegram-${event.actor.platform_user_id}`;
    const actor = {
      canonical_user_id: event.actor.platform_user_id,
      platform: "telegram",
    };
    
    switch (event.type) {
      case "message":
        if (event.payload.voice || event.payload.video_note) {
          events.push(
            buildVoiceTurnStarted({
              session_id: sessionId,
              turn_id: this.turnCounter++,
              channel: "telegram",
              actor,
            })
          );
        }
        break;
    }
    
    return events;
  }
  
  async sendEvent(coreEvent: CoreEvent): Promise<void> {
    console.log("[Telegram] Sending event:", coreEvent.event_type);
  }
  
  async destroy(): Promise<void> {
    console.log("[Telegram] Destroying adapter");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gateway
// ─────────────────────────────────────────────────────────────────────────────

export interface GatewayConfig {
  adapters: ChannelAdapter[];
}

export class MCPSGateway {
  private adapters: Map<SupportedPlatform, ChannelAdapter> = new Map();
  
  constructor(config: GatewayConfig) {
    for (const adapter of config.adapters) {
      this.adapters.set(adapter.platform, adapter);
    }
  }
  
  async initialize(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.initialize();
    }
  }
  
  async handlePlatformEvent(event: PlatformEvent): Promise<CoreEvent[]> {
    const adapter = this.adapters.get(event.platform);
    if (!adapter) {
      throw new Error(`No adapter for platform: ${event.platform}`);
    }
    return adapter.handleEvent(event);
  }
  
  async sendToPlatform(platform: SupportedPlatform, event: CoreEvent): Promise<void> {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`No adapter for platform: ${platform}`);
    }
    return adapter.sendEvent(event);
  }
  
  async destroy(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.destroy();
    }
  }
}

// Factory
export function createGateway(adapters: ChannelAdapter[]): MCPSGateway {
  return new MCPSGateway({ adapters });
}
