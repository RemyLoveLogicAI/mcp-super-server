/**
 * Mesh Routing Contract.
 * Whitepaper §5 Pillar 3: MCP Mesh & Federation
 * Whitepaper §4.2.9: Mesh Router
 * 
 * Routes requests to appropriate servers based on:
 * - Capability requirements
 * - Trust tiers
 * - Latency constraints
 * - Cost budgets
 */

import type { ServerDescriptor, TrustTier } from "../policies/trust";

// ─────────────────────────────────────────────────────────────────────────────
// Route Request
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A request to route to a capable server.
 */
export type RouteRequest = {
  /** Required capabilities */
  required_capabilities: string[];
  
  /** Minimum trust tier required */
  min_trust_tier?: TrustTier;
  
  /** Maximum acceptable latency in ms */
  max_latency_ms?: number;
  
  /** Cost budget (implementation-defined units) */
  budget_units?: number;
  
  /** Preferred region for locality */
  preferred_region?: string;
  
  /** Exclude these server IDs */
  exclude_servers?: string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Route Result
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of routing, may include multiple candidates.
 */
export type RouteResult = {
  /** Best matching server */
  primary: ServerDescriptor;
  
  /** Alternative servers (for failover) */
  alternatives?: ServerDescriptor[];
  
  /** Routing metadata */
  metadata?: {
    /** How the routing decision was made */
    routing_reason?: string;
    /** Estimated latency to primary */
    estimated_latency_ms?: number;
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Discovery Options
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for server discovery.
 */
export type DiscoveryOptions = {
  /** Filter by capabilities */
  capabilities?: string[];
  
  /** Filter by trust tier */
  min_trust_tier?: TrustTier;
  
  /** Filter by region */
  region?: string;
  
  /** Only return healthy servers */
  healthy_only?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Mesh Router Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interface that mesh router implementations MUST provide.
 */
export interface MeshRouter {
  /**
   * Discover available servers in the mesh.
   */
  discover(options?: DiscoveryOptions): Promise<ServerDescriptor[]>;
  
  /**
   * Route a request to an appropriate server.
   */
  route(req: RouteRequest): Promise<RouteResult>;
  
  /**
   * Register a server in the mesh.
   */
  register?(server: ServerDescriptor): Promise<void>;
  
  /**
   * Deregister a server from the mesh.
   */
  deregister?(server_id: string): Promise<void>;
  
  /**
   * Update server health status.
   */
  updateHealth?(server_id: string, healthy: boolean): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependency Injection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Agent dependency declaration.
 * Whitepaper §5 Pillar 3: Dependency Injection
 */
export type AgentDependencies = {
  /** Agent identifier */
  agent_id: string;
  
  /** Required dependencies (capability tags) */
  needs: string[];
  
  /** Optional dependencies (nice to have) */
  wants?: string[];
};

/**
 * Resolved dependencies for an agent.
 */
export type ResolvedDependencies = {
  /** Agent identifier */
  agent_id: string;
  
  /** Mapping from capability to server */
  providers: Record<string, ServerDescriptor>;
  
  /** Unresolved required dependencies */
  missing?: string[];
};

/**
 * Dependency resolver interface.
 */
export interface DependencyResolver {
  /**
   * Resolve dependencies for an agent.
   */
  resolve(deps: AgentDependencies): Promise<ResolvedDependencies>;
}
