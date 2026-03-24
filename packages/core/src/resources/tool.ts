/**
 * Tool Descriptor Resource.
 * Whitepaper §5 Pillar 2: Tool Manager (capability registry)
 * 
 * Tools are registered capabilities that agents can invoke.
 * Exposed at: /tools/{tool_id}
 */

import { z } from "../schemas/zod";

// ─────────────────────────────────────────────────────────────────────────────
// Tool Descriptor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Description of a tool's capabilities and constraints.
 * Used for capability discovery and routing.
 */
export const ToolDescriptor = z.object({
  /** Unique tool identifier */
  tool_id: z.string(),
  
  /** Tool version (semver recommended) */
  version: z.string(),
  
  /** Human-readable tool name */
  name: z.string().optional(),
  
  /** Tool description */
  description: z.string().optional(),
  
  /** Capability tags for routing */
  capabilities: z.array(z.string()),
  
  /** Side effect classification */
  side_effect_class: z.enum(["read_only", "reversible_write", "irreversible_write"]),
  
  /** Minimum trust tier required to invoke */
  min_trust_tier: z.enum(["untrusted", "semi_trusted", "trusted"]).optional(),
  
  /** Hash of the input schema */
  schema_hash: z.string().optional(),
  
  /** Expected latency in ms (p95) */
  expected_latency_ms: z.number().int().positive().optional(),
  
  /** Whether this tool is currently available */
  available: z.boolean().optional()
});

export type ToolDescriptor = z.infer<typeof ToolDescriptor>;

// ─────────────────────────────────────────────────────────────────────────────
// Tool Types (Whitepaper §5 Pillar 2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Predefined tool type categories.
 */
export const ToolType = z.enum([
  "local_sandbox",       // Safe interpreter / workflow
  "desktop_control",     // UI automation
  "remote_shell",        // SSH-MCP
  "cloud_provisioning",  // AWS/Azure/GCP
  "messaging",           // OpenClaw gateway integration
  "database",            // Database operations
  "file_system",         // File operations
  "web_fetch",           // HTTP requests
  "custom"               // User-defined
]);

export type ToolType = z.infer<typeof ToolType>;

// ─────────────────────────────────────────────────────────────────────────────
// Tool Registry Entry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full tool registry entry with metadata.
 */
export const ToolRegistryEntry = z.object({
  /** Tool descriptor */
  descriptor: ToolDescriptor,
  
  /** Tool type category */
  tool_type: ToolType.optional(),
  
  /** Server that provides this tool */
  provider_server_id: z.string().optional(),
  
  /** When this tool was registered */
  registered_at: z.string().optional(),
  
  /** When this tool was last updated */
  updated_at: z.string().optional(),
  
  /** Publisher/owner identity */
  publisher: z.string().optional()
});

export type ToolRegistryEntry = z.infer<typeof ToolRegistryEntry>;
