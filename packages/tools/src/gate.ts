/**
 * @mss/tools - Tool Gate Implementation
 * Whitepaper §4.2.5 + §5 Pillar 2
 *
 * Responsibilities:
 * - Capability validation
 * - Trust tier enforcement
 * - Side effect classification
 * - Human approval gates
 *
 * Policy: DENY by default, explicit ALLOW required
 */

import {
  ToolGateDecision,
  GateContext,
  AsyncToolGate,
} from "@mss/core/policies/gates";
import {
  SideEffectClass,
  ApprovalPolicy,
  EffectPolicy,
  DEFAULT_EFFECT_POLICIES,
  requiresHumanApproval,
} from "@mss/core/policies/effects";
import {
  TrustTier,
  meetsTrustRequirement,
  ServerDescriptor,
} from "@mss/core/policies/trust";
import { ToolDescriptor, ToolType } from "@mss/core/resources/tool";
import {
  UUID,
  CanonicalUserId,
  SessionId,
  ToolId,
  CapabilityTag,
} from "@mss/core/ids";

// ============================================================================
// Gate Configuration
// ============================================================================

export interface ToolGateConfig {
  /** Default approval policy if not specified */
  defaultApproval: ApprovalPolicy;

  /** Maximum tool calls per session */
  maxCallsPerSession: number;

  /** Maximum cost units per session */
  maxCostPerSession?: number;

  /** Allowed tool types (empty = all) */
  allowedToolTypes?: ToolType[];

  /** Blocked tool IDs */
  blockedTools?: ToolId[];

  /** Required capabilities for all calls */
  requiredCapabilities?: CapabilityTag[];

  /** Trust tier overrides by tool ID */
  trustOverrides?: Map<ToolId, TrustTier>;

  /** Custom gates to chain */
  customGates?: AsyncToolGate[];
}

export const DEFAULT_GATE_CONFIG: ToolGateConfig = {
  defaultApproval: "require_human",
  maxCallsPerSession: 10,
  maxCostPerSession: 1000,
  allowedToolTypes: [] as ToolType[], // All allowed (empty = unrestricted)
  blockedTools: [],
  requiredCapabilities: [],
  trustOverrides: new Map(),
  customGates: [],
};

// ============================================================================
// Session Budget Tracker
// ============================================================================

export interface SessionBudget {
  session_id: SessionId;
  calls_made: number;
  cost_spent: number;
  calls_by_tool: Map<ToolId, number>;
}

export class BudgetTracker {
  private sessions: Map<SessionId, SessionBudget> = new Map();

  getOrCreate(sessionId: SessionId): SessionBudget {
    let budget = this.sessions.get(sessionId);
    if (!budget) {
      budget = {
        session_id: sessionId,
        calls_made: 0,
        cost_spent: 0,
        calls_by_tool: new Map(),
      };
      this.sessions.set(sessionId, budget);
    }
    return budget;
  }

  recordCall(sessionId: SessionId, toolId: ToolId, cost: number = 1): void {
    const budget = this.getOrCreate(sessionId);
    budget.calls_made++;
    budget.cost_spent += cost;
    const toolCalls = budget.calls_by_tool.get(toolId) ?? 0;
    budget.calls_by_tool.set(toolId, toolCalls + 1);
  }

  clear(sessionId: SessionId): void {
    this.sessions.delete(sessionId);
  }

  clearAll(): void {
    this.sessions.clear();
  }
}

// ============================================================================
// Gate Decision Reasons
// ============================================================================

export type GateDenialReason =
  | { code: "TOOL_BLOCKED"; tool_id: ToolId }
  | { code: "TOOL_NOT_FOUND"; tool_id: ToolId }
  | { code: "TOOL_UNAVAILABLE"; tool_id: ToolId }
  | { code: "TRUST_INSUFFICIENT"; required: TrustTier; actual: TrustTier }
  | { code: "BUDGET_EXCEEDED"; limit: number; current: number }
  | { code: "COST_EXCEEDED"; limit: number; current: number }
  | { code: "TOOL_TYPE_BLOCKED"; tool_type: ToolType }
  | { code: "CAPABILITY_MISSING"; missing: CapabilityTag[] }
  | { code: "EFFECT_BLOCKED"; effect: SideEffectClass }
  | { code: "CUSTOM_GATE_DENIED"; gate: string; reason?: string };

export interface GateResult {
  decision: "allow" | "deny" | "require_human";
  reason?: GateDenialReason;
  approval_required?: boolean;
  approval_context?: string;
}

// ============================================================================
// Tool Gate Implementation
// ============================================================================

export class PolicyToolGate {
  private config: ToolGateConfig;
  private budgetTracker: BudgetTracker;
  private toolRegistry: Map<ToolId, ToolDescriptor>;
  private serverRegistry: Map<string, ServerDescriptor>;

  constructor(
    config: Partial<ToolGateConfig> = {},
    budgetTracker?: BudgetTracker
  ) {
    this.config = { ...DEFAULT_GATE_CONFIG, ...config };
    this.budgetTracker = budgetTracker ?? new BudgetTracker();
    this.toolRegistry = new Map();
    this.serverRegistry = new Map();
  }

  // --------------------------------------------------------------------------
  // Registry Management
  // --------------------------------------------------------------------------

  registerTool(descriptor: ToolDescriptor): void {
    this.toolRegistry.set(descriptor.tool_id, descriptor);
  }

  registerServer(descriptor: ServerDescriptor): void {
    this.serverRegistry.set(descriptor.server_id, descriptor);
  }

  unregisterTool(toolId: ToolId): void {
    this.toolRegistry.delete(toolId);
  }

  getTool(toolId: ToolId): ToolDescriptor | undefined {
    return this.toolRegistry.get(toolId);
  }

  // --------------------------------------------------------------------------
  // Gate Evaluation
  // --------------------------------------------------------------------------

  async evaluate(context: GateContext): Promise<GateResult> {
    // 1. Check blocklist
    if (this.config.blockedTools?.includes(context.tool_id)) {
      return {
        decision: "deny",
        reason: { code: "TOOL_BLOCKED", tool_id: context.tool_id },
      };
    }

    // 2. Get tool descriptor
    const tool = this.toolRegistry.get(context.tool_id);
    if (!tool) {
      return {
        decision: "deny",
        reason: { code: "TOOL_NOT_FOUND", tool_id: context.tool_id },
      };
    }

    // 3. Check tool availability
    if (!tool.available) {
      return {
        decision: "deny",
        reason: { code: "TOOL_UNAVAILABLE", tool_id: context.tool_id },
      };
    }

    // 4. Check trust tier
    const requiredTrust = this.config.trustOverrides?.get(context.tool_id) ?? tool.min_trust_tier;
    if (requiredTrust) {
      // For now, assume "trusted" context — in real impl, derive from session
      const contextTrust: TrustTier = "trusted";
      if (!meetsTrustRequirement(contextTrust, requiredTrust)) {
        return {
          decision: "deny",
          reason: {
            code: "TRUST_INSUFFICIENT",
            required: requiredTrust,
            actual: contextTrust,
          },
        };
      }
    }

    // 5. Check session budget
    if (context.session_id) {
      const budget = this.budgetTracker.getOrCreate(context.session_id as SessionId);

      if (budget.calls_made >= this.config.maxCallsPerSession) {
        return {
          decision: "deny",
          reason: {
            code: "BUDGET_EXCEEDED",
            limit: this.config.maxCallsPerSession,
            current: budget.calls_made,
          },
        };
      }

      if (
        this.config.maxCostPerSession &&
        budget.cost_spent >= this.config.maxCostPerSession
      ) {
        return {
          decision: "deny",
          reason: {
            code: "COST_EXCEEDED",
            limit: this.config.maxCostPerSession,
            current: budget.cost_spent,
          },
        };
      }
    }

    // 6. Check tool type
    if (this.config.allowedToolTypes && this.config.allowedToolTypes.length > 0) {
      // Get tool type from registry entry
      const toolType = this.getToolType(context.tool_id);
      if (toolType && !this.config.allowedToolTypes.includes(toolType)) {
        return {
          decision: "deny",
          reason: { code: "TOOL_TYPE_BLOCKED", tool_type: toolType },
        };
      }
    }

    // 7. Check capabilities
    if (this.config.requiredCapabilities && this.config.requiredCapabilities.length > 0) {
      const missing = this.config.requiredCapabilities.filter(
        (cap) => !tool.capabilities.includes(cap)
      );
      if (missing.length > 0) {
        return {
          decision: "deny",
          reason: { code: "CAPABILITY_MISSING", missing },
        };
      }
    }

    // 8. Check side effect policy
    const effectPolicy = DEFAULT_EFFECT_POLICIES[tool.side_effect_class];
    if (effectPolicy.approval === "blocked") {
      return {
        decision: "deny",
        reason: { code: "EFFECT_BLOCKED", effect: tool.side_effect_class },
      };
    }

    // 9. Run custom gates
    for (const customGate of this.config.customGates ?? []) {
      const customDecision = await customGate(context);
      if (customDecision.decision === "deny") {
        return {
          decision: "deny",
          reason: { code: "CUSTOM_GATE_DENIED", gate: "custom" },
        };
      }
      if (customDecision.decision === "require_human") {
        return {
          decision: "require_human",
          approval_required: true,
          approval_context: `Custom gate requires approval for ${context.tool_id}`,
        };
      }
    }

    // 10. Check if human approval required
    if (requiresHumanApproval(tool.side_effect_class)) {
      return {
        decision: "require_human",
        approval_required: true,
        approval_context: `Tool ${tool.name} has ${tool.side_effect_class} effects`,
      };
    }

    // All checks passed
    return { decision: "allow" };
  }

  // --------------------------------------------------------------------------
  // Budget Management
  // --------------------------------------------------------------------------

  recordToolCall(sessionId: SessionId, toolId: ToolId, cost: number = 1): void {
    this.budgetTracker.recordCall(sessionId, toolId, cost);
  }

  getBudget(sessionId: SessionId): SessionBudget {
    return this.budgetTracker.getOrCreate(sessionId);
  }

  resetBudget(sessionId: SessionId): void {
    this.budgetTracker.clear(sessionId);
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private getToolType(toolId: ToolId): ToolType | undefined {
    // In real impl, this would come from ToolRegistryEntry
    // For now, infer from tool ID prefix
    const id = toolId as string;
    if (id.startsWith("sandbox:")) return "local_sandbox";
    if (id.startsWith("desktop:")) return "desktop_control";
    if (id.startsWith("shell:")) return "remote_shell";
    if (id.startsWith("cloud:")) return "cloud_provisioning";
    if (id.startsWith("msg:")) return "messaging";
    if (id.startsWith("db:")) return "database";
    if (id.startsWith("fs:")) return "file_system";
    if (id.startsWith("web:")) return "web_fetch";
    return "custom";
  }
}

// ============================================================================
// Factory & Helpers
// ============================================================================

export function createToolGate(
  config?: Partial<ToolGateConfig>
): PolicyToolGate {
  return new PolicyToolGate(config);
}

/**
 * Create a gate that allows only read-only tools.
 */
export function createReadOnlyGate(): PolicyToolGate {
  return new PolicyToolGate({
    defaultApproval: "auto",
    customGates: [
      async (ctx: GateContext): Promise<ToolGateDecision> => {
        const effect = ctx.requested_effect;
        const sideEffect = typeof effect === "string" ? effect : effect.sideEffect;
        if (sideEffect === "read_only") {
          return { decision: "allow", policy: ctx.requested_effect };
        }
        return { decision: "deny", reason: "Read-only gate: tool is not read-only" };
      },
    ],
  });
}

/**
 * Create a gate that requires human approval for all write operations.
 */
export function createWriteApprovalGate(): PolicyToolGate {
  return new PolicyToolGate({
    defaultApproval: "require_human",
    customGates: [
      async (ctx: GateContext): Promise<ToolGateDecision> => {
        const effect = ctx.requested_effect;
        const sideEffect = typeof effect === "string" ? effect : effect.sideEffect;
        if (sideEffect === "read_only") {
          return { decision: "allow", policy: ctx.requested_effect };
        }
        return {
          decision: "require_human",
          policy: ctx.requested_effect,
          prompt: `Human approval required for ${sideEffect} operation: ${ctx.purpose}`,
        };
      },
    ],
  });
}

/**
 * Create a gate for testing that allows everything.
 * DO NOT USE IN PRODUCTION.
 */
export function createPermissiveGate(): PolicyToolGate {
  return new PolicyToolGate({
    defaultApproval: "auto",
    maxCallsPerSession: 1000,
    maxCostPerSession: 100000,
  });
}
