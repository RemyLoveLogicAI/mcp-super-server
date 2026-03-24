/**
 * @mss/gateway — Gateway Layer
 * Whitepaper §4.2.1
 * 
 * This package will implement:
 * - Channel adapters (Discord, Telegram, WhatsApp, Web, R1)
 * - Transport termination (WebSocket, gRPC)
 * - Protocol translation
 * 
 * All event types and resources come from @mss/core.
 */

// Re-export core types used by gateway consumers
export type { CoreEvent } from "@mss/core";

// Gateway-specific interfaces will be added here
// Implementation intentionally deferred (contract-first)
