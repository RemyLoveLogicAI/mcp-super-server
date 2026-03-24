/**
 * Trust Tier Policies.
 * Whitepaper §7.1: Trust Boundaries
 * 
 * Trust boundaries define what each component can do:
 * - untrusted: client devices, channel platforms
 * - semi_trusted: gateway layer
 * - trusted: core server components
 */

// ─────────────────────────────────────────────────────────────────────────────
// Trust Tier Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Trust tier classification.
 */
export type TrustTier = 
  | "untrusted"      // Client devices, external platforms
  | "semi_trusted"   // Gateway layer
  | "trusted";       // Core server components

/**
 * Trust tier ordering (higher index = more trusted).
 */
export const TRUST_TIER_ORDER: Record<TrustTier, number> = {
  untrusted: 0,
  semi_trusted: 1,
  trusted: 2
};

// ─────────────────────────────────────────────────────────────────────────────
// Server Descriptor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Description of a server in the mesh.
 * Used for capability discovery and routing.
 */
export type ServerDescriptor = {
  /** Unique server identifier */
  server_id: string;
  
  /** Trust tier of this server */
  trust_tier: TrustTier;
  
  /** Capabilities this server provides */
  capabilities: string[];
  
  /** Geographic region (for latency routing) */
  region?: string;
  
  /** SLA guarantees */
  sla?: {
    /** 95th percentile latency in ms */
    p95_ms?: number;
    /** Availability percentage (0-100) */
    availability?: number;
  };
  
  /** Version of the server */
  version?: string;
  
  /** Health status */
  healthy?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Trust Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a trust tier meets a minimum requirement.
 */
export function meetsTrustRequirement(
  actual: TrustTier, 
  required: TrustTier
): boolean {
  return TRUST_TIER_ORDER[actual] >= TRUST_TIER_ORDER[required];
}

/**
 * Get the highest trust tier from a list.
 */
export function maxTrustTier(...tiers: TrustTier[]): TrustTier {
  return tiers.reduce((max, tier) => 
    TRUST_TIER_ORDER[tier] > TRUST_TIER_ORDER[max] ? tier : max
  , "untrusted" as TrustTier);
}

/**
 * Get the lowest trust tier from a list.
 */
export function minTrustTier(...tiers: TrustTier[]): TrustTier {
  return tiers.reduce((min, tier) => 
    TRUST_TIER_ORDER[tier] < TRUST_TIER_ORDER[min] ? tier : min
  , "trusted" as TrustTier);
}

/**
 * Default trust boundaries per component type.
 * Whitepaper §7.1
 */
export const DEFAULT_TRUST_BOUNDARIES: Record<string, TrustTier> = {
  "client_device": "untrusted",
  "channel_platform": "untrusted",
  "gateway": "semi_trusted",
  "core_server": "trusted",
  "tool_sandbox": "untrusted"  // Tools run in least-trust sandboxes
};
