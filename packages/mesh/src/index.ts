/**
 * @mss/mesh — Mesh Router
 * Whitepaper §4.2.9 + §5 Pillar 3
 * 
 * This package will implement:
 * - Capability discovery
 * - Trust tier routing
 * - Latency/locality routing
 * - Cost budget routing
 * - Dependency injection
 * - Federation support
 */

// Re-export core types
export type { 
  MeshRouter, 
  DependencyResolver,
  RouteRequest,
  RouteResult,
  DiscoveryOptions,
  AgentDependencies,
  ResolvedDependencies 
} from "@mss/core/contracts";

export type { 
  ServerDescriptor, 
  TrustTier,
  TRUST_TIER_ORDER,
  meetsTrustRequirement 
} from "@mss/core/policies";

// ─────────────────────────────────────────────────────────────────────────────
// Mesh Implementation Types (stub)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discovery backend configuration.
 */
export type DiscoveryBackendConfig = 
  | { type: "static"; servers: import("@mss/core").ServerDescriptor[] }
  | { type: "consul"; address: string }
  | { type: "gossip"; seed_nodes: string[] };

/**
 * Routing strategy.
 */
export type RoutingStrategy = 
  | "round_robin"     // Simple rotation
  | "least_latency"   // Prefer lowest latency
  | "least_cost"      // Prefer lowest cost
  | "locality_aware"  // Prefer same region
  | "weighted";       // Weighted random

/**
 * Mesh router configuration.
 */
export type MeshRouterConfig = {
  /** Discovery backend */
  discovery: DiscoveryBackendConfig;
  
  /** Routing strategy */
  strategy: RoutingStrategy;
  
  /** Health check interval in ms */
  health_check_interval_ms?: number;
  
  /** Cache TTL for discovery results */
  discovery_cache_ttl_ms?: number;
};

// Implementation intentionally deferred (contract-first)
