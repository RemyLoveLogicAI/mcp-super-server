/**
 * Tool Call Contract.
 * Whitepaper §5 Pillar 2: Autonomous Agents & Tools
 * 
 * Defines the interface for invoking and canceling tools.
 * All tool invocations MUST go through this contract.
 */

import type { SideEffectClass, ApprovalPolicy } from "../policies/effects";

// ─────────────────────────────────────────────────────────────────────────────
// Tool Call Request
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A request to invoke a tool.
 * Every tool call MUST include this information.
 */
export type ToolCallRequest = {
  /** Unique identifier for this call */
  tool_call_id: string;
  
  /** Tool being invoked */
  tool_id: string;
  
  /** Version of the tool */
  tool_version: string;
  
  /** Capability scopes being requested */
  scope: string[];
  
  /** Human-readable purpose (for audit) */
  purpose: string;
  
  /** Timeout in milliseconds */
  timeout_ms: number;
  
  /** Retry policy (optional) */
  retry?: {
    max_attempts: number;
    backoff_ms: number;
  };
  
  /** Side effect classification */
  side_effect_class: SideEffectClass;
  
  /** Approval policy applied */
  approval: ApprovalPolicy;
  
  /** Hash of the input schema (for validation) */
  schema_hash?: string;
  
  /** Input payload (schema varies by tool) */
  input: unknown;
};

// ─────────────────────────────────────────────────────────────────────────────
// Tool Call Result
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of a tool invocation.
 */
export type ToolCallResult =
  | {
      ok: true;
      /** Output payload */
      output: unknown;
      /** Execution duration */
      duration_ms: number;
    }
  | {
      ok: false;
      /** Error message */
      error: string;
      /** Execution duration (may be partial) */
      duration_ms: number;
      /** Whether partial side effects may have occurred */
      partial_execution?: boolean;
    };

// ─────────────────────────────────────────────────────────────────────────────
// Tool Invoker Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interface that tool managers MUST implement.
 */
export interface ToolInvoker {
  /**
   * Invoke a tool with the given request.
   * @returns Result of the invocation
   */
  invoke(req: ToolCallRequest): Promise<ToolCallResult>;
  
  /**
   * Cancel a pending tool call.
   * @param tool_call_id - ID of the call to cancel
   * @param reason - Reason for cancellation
   */
  cancel(tool_call_id: string, reason: string): Promise<void>;
  
  /**
   * Check if a tool call is currently in progress.
   * @param tool_call_id - ID of the call to check
   */
  isInProgress?(tool_call_id: string): Promise<boolean>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Capability Query
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query for tool capabilities.
 */
export type ToolCapabilityQuery = {
  /** Required capabilities */
  required_capabilities: string[];
  
  /** Maximum side effect class allowed */
  max_side_effect_class?: SideEffectClass;
  
  /** Only return available tools */
  available_only?: boolean;
};
