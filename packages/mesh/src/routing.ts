/**
 * @mss/mesh - Capability Routing & Federation
 * Whitepaper §4.2.9
 * 
 * Mesh layer handles:
 * - Capability discovery
 * - Request routing by capability
 * - Federation across servers
 * - Load balancing
 */

export const version = "0.0.1";

// ─────────────────────────────────────────────────────────────────────────────
// Server Descriptor
// ─────────────────────────────────────────────────────────────────────────────

export interface ServerDescriptor {
  server_id: string;
  url: string;
  capabilities: Capability[];
  region?: string;
  trust_tier: TrustTier;
  healthy: boolean;
  load_factor: number;  // 0-1, higher = more loaded
  sla?: {
    p95_ms?: number;
    availability?: number;
  };
}

export type TrustTier = "untrusted" | "semi_trusted" | "trusted";

export interface Capability {
  name: string;
  version?: string;
  tags?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Routing
// ─────────────────────────────────────────────────────────────────────────────

export interface RouteRequest {
  capability: string;
  required_tags?: string[];
  preferred_region?: string;
  max_load_factor?: number;  // Max load before rejecting
}

export interface RouteResult {
  server: ServerDescriptor;
  routed_at: string;
}

export interface NoRouteResult {
  reason: "no_servers" | "no_matching_capability" | "all_overloaded" | "trust_failure";
}

// ─────────────────────────────────────────────────────────────────────────────
// Mesh Registry
// ─────────────────────────────────────────────────────────────────────────────

export interface MeshRegistry {
  /** Register a server */
  register(server: ServerDescriptor): Promise<void>;
  
  /** Deregister a server */
  deregister(server_id: string): Promise<void>;
  
  /** Update server health/load */
  update(server_id: string, updates: Partial<ServerDescriptor>): Promise<void>;
  
  /** Find servers by capability */
  find(capability: string): Promise<ServerDescriptor[]>;
  
  /** Get server by ID */
  get(server_id: string): Promise<ServerDescriptor | null>;
}

export class InMemoryMeshRegistry implements MeshRegistry {
  private servers: Map<string, ServerDescriptor> = new Map();
  
  async register(server: ServerDescriptor): Promise<void> {
    this.servers.set(server.server_id, server);
  }
  
  async deregister(server_id: string): Promise<void> {
    this.servers.delete(server_id);
  }
  
  async update(server_id: string, updates: Partial<ServerDescriptor>): Promise<void> {
    const existing = this.servers.get(server_id);
    if (existing) {
      this.servers.set(server_id, { ...existing, ...updates });
    }
  }
  
  async find(capability: string): Promise<ServerDescriptor[]> {
    return Array.from(this.servers.values()).filter(
      (s) => s.healthy && s.capabilities.some((c) => c.name === capability)
    );
  }
  
  async get(server_id: string): Promise<ServerDescriptor | null> {
    return this.servers.get(server_id) ?? null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

export interface RouterConfig {
  registry: MeshRegistry;
  local_server_id?: string;
  default_region?: string;
  prefer_local?: boolean;
}

export class CapabilityRouter {
  private config: RouterConfig;
  
  constructor(config: RouterConfig) {
    this.config = {
      prefer_local: true,
      default_region: "us-east-1",
      ...config,
    };
  }
  
  async route(request: RouteRequest): Promise<RouteResult | NoRouteResult> {
    const servers = await this.config.registry.find(request.capability);
    
    if (servers.length === 0) {
      return { reason: "no_matching_capability" };
    }
    
    // Filter by load
    let candidates = servers.filter(
      (s) => request.max_load_factor === undefined || s.load_factor <= request.max_load_factor
    );
    
    if (candidates.length === 0) {
      return { reason: "all_overloaded" };
    }
    
    // Prefer local server
    if (this.config.prefer_local && this.config.local_server_id) {
      const local = candidates.find((s) => s.server_id === this.config.local_server_id);
      if (local) {
        return { server: local, routed_at: new Date().toISOString() };
      }
    }
    
    // Prefer same region
    if (request.preferred_region) {
      const sameRegion = candidates.find((s) => s.region === request.preferred_region);
      if (sameRegion) {
        return { server: sameRegion, routed_at: new Date().toISOString() };
      }
    }
    
    // Pick lowest load
    candidates.sort((a, b) => a.load_factor - b.load_factor);
    const selected = candidates[0];
    if (!selected) {
      return { reason: "no_servers" };
    }
    return { server: selected, routed_at: new Date().toISOString() };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Federation
// ─────────────────────────────────────────────────────────────────────────────

export interface FederationConfig {
  local_server: ServerDescriptor;
  registry: MeshRegistry;
  router: CapabilityRouter;
}

export class FederatedMesh {
  private config: FederationConfig;
  
  constructor(config: FederationConfig) {
    this.config = config;
  }
  
  /** Announce this server to the mesh */
  async announce(): Promise<void> {
    await this.config.registry.register(this.config.local_server);
  }
  
  /** Route a request to a capable server */
  async routeRequest(request: RouteRequest): Promise<RouteResult | NoRouteResult> {
    return this.config.router.route(request);
  }
  
  /** Forward a tool call to a remote server */
  async forwardToServer(
    server: ServerDescriptor,
    tool_id: string,
    input: Record<string, unknown>
  ): Promise<unknown> {
    const response = await fetch(`${server.url}/tools/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool_id, input }),
    });
    
    if (!response.ok) {
      throw new Error(`Forward failed: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  /** Update local server status */
  async updateStatus(updates: Partial<ServerDescriptor>): Promise<void> {
    await this.config.registry.update(this.config.local_server.server_id, updates);
  }
}

// Factory
export function createMesh(
  localServer: ServerDescriptor,
  options?: Partial<RouterConfig>
): FederatedMesh {
  const registry = new InMemoryMeshRegistry();
  const router = new CapabilityRouter({ registry, ...options });
  
  return new FederatedMesh({ local_server: localServer, registry, router });
}
