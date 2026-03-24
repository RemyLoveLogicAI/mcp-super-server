/**
 * @mss/tools — Tool Manager
 * Whitepaper §4.2.5 + §5 Pillar 2
 * 
 * This package will implement:
 * - Capability registry
 * - Sandbox execution
 * - Credential scoping
 * - Side effect enforcement
 */

// Re-export core types
export type { 
  ToolInvoker, 
  ToolCallRequest, 
  ToolCallResult,
  ToolCapabilityQuery 
} from "@mss/core/contracts";

export type { 
  ToolDescriptor, 
  ToolRegistryEntry,
  ToolType 
} from "@mss/core/resources";

export type { 
  SideEffectClass, 
  ApprovalPolicy, 
  EffectPolicy 
} from "@mss/core/policies";

// ─────────────────────────────────────────────────────────────────────────────
// Tool Manager Types (stub)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tool registry interface.
 */
export interface ToolRegistry {
  /** Register a tool */
  register(entry: import("@mss/core").ToolRegistryEntry): Promise<void>;
  
  /** Deregister a tool */
  deregister(tool_id: string): Promise<void>;
  
  /** Get a tool by ID */
  get(tool_id: string): Promise<import("@mss/core").ToolRegistryEntry | null>;
  
  /** Query tools by capabilities */
  query(query: import("@mss/core").ToolCapabilityQuery): Promise<import("@mss/core").ToolRegistryEntry[]>;
}

/**
 * Sandbox configuration.
 */
export type SandboxConfig = {
  /** Sandbox identifier */
  sandbox_id: string;
  
  /** Whether this sandbox persists */
  persistent: boolean;
  
  /** Retention policy (if persistent) */
  retention_days?: number;
  
  /** Resource limits */
  limits?: {
    memory_mb?: number;
    cpu_shares?: number;
    timeout_ms?: number;
  };
};

// Implementation intentionally deferred (contract-first)

// ─────────────────────────────────────────────────────────────────────────────
// Gate implementations
// ─────────────────────────────────────────────────────────────────────────────

export { PolicyToolGate, BudgetTracker, createToolGate, createReadOnlyGate, createWriteApprovalGate, createPermissiveGate } from "./gate.js";
export type { ToolGateConfig, SessionBudget, GateDenialReason, GateResult } from "./gate.js";
