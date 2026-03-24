/**
 * @mss/context-fabric — Multimodal Context Fabric
 * Whitepaper §4.2.3 + Innovation #1
 * 
 * This package will implement:
 * - Multimodal event ingestion
 * - Context normalization
 * - Bidirectional linking (identity ↔ tools ↔ state ↔ memory)
 * - Policy-scoped query + streaming
 * 
 * Context is platform-level, not per-agent.
 */

// Re-export core types
export type { CoreEvent } from "@mss/core/events";
export type { 
  VoiceSessionStateResource,
  WorldStateResource,
  CanonicalIdentityResource,
  ToolDescriptor 
} from "@mss/core/resources";

// ─────────────────────────────────────────────────────────────────────────────
// Context Fabric Types (stub)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A versioned context object.
 */
export type ContextObject = {
  /** Context object ID */
  id: string;
  
  /** Version for optimistic concurrency */
  version: number;
  
  /** Type of context */
  type: "voice" | "chat" | "tool" | "world" | "identity";
  
  /** Links to related objects */
  links: ContextLink[];
  
  /** Normalized payload */
  payload: unknown;
  
  /** When this context was created */
  created_at: string;
};

/**
 * A link between context objects.
 */
export type ContextLink = {
  /** Target object ID */
  target_id: string;
  
  /** Relationship type */
  relationship: string;
  
  /** Link direction */
  direction: "outbound" | "inbound" | "bidirectional";
};

// Implementation intentionally deferred (contract-first)

// ─────────────────────────────────────────────────────────────────────────────
// Stub implementation
// ─────────────────────────────────────────────────────────────────────────────

export interface ContextFabric {
  createAndLink(type: string, data: Record<string, unknown>, links: ContextLink[]): Promise<void>;
}

export function createContextFabric(): ContextFabric {
  return {
    async createAndLink(_type, _data, _links) {
      // No-op stub: implementation deferred
    },
  };
}
