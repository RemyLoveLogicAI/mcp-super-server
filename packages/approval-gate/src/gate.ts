/**
 * @mss/approval-gate - Gate Integration
 * Integrates approval queue with PolicyToolGate
 */

import type { ToolGateDecision, AsyncToolGate } from "@mss/core/policies/gates";
import type { GateContext } from "@mss/core/policies/gates";
import type { EffectPolicy, SideEffectClass } from "@mss/core/policies/effects";
import { requiresHumanApproval } from "@mss/core/policies/effects";
import type { ApprovalRequest, RiskLevel } from "./schema.js";
import { ApprovalQueue } from "./queue.js";
import { ApprovalNotifier } from "./notify.js";

/**
 * Configuration for approval gate.
 */
export interface ApprovalGateConfig {
  /** Queue instance */
  queue: ApprovalQueue;
  /** Notifier instance */
  notifier: ApprovalNotifier;
  /** Map side effect classes to risk levels */
  riskLevelMap: Record<SideEffectClass, RiskLevel>;
  /** Custom timeout overrides */
  timeoutOverrides?: Partial<Record<RiskLevel, number>>;
}

/**
 * Create an async tool gate that routes "require_human" decisions through approval queue.
 * Blocks execution until approved, denied, or expired.
 */
export function createApprovalGate(config: ApprovalGateConfig): AsyncToolGate {
  const { queue, notifier, riskLevelMap } = config;

  return async (ctx: GateContext): Promise<ToolGateDecision> => {
    const effect = ctx.requested_effect;
    const sideEffect = effect.sideEffect as SideEffectClass;

    // Only intercept if human approval is required
    if (!requiresHumanApproval(sideEffect)) {
      return { decision: "allow", policy: effect };
    }

    const riskLevel = riskLevelMap[sideEffect] ?? "medium";
    const timeout_ms =
      config.timeoutOverrides?.[riskLevel] ??
      (riskLevel === "critical" ? 30000 : riskLevel === "high" ? 60000 : riskLevel === "medium" ? 180000 : 300000);

    const reversibility = sideEffect === "reversible_write";

    // Create approval request
    const request = await queue.create({
      action: `${ctx.purpose || "Tool call"}: ${ctx.tool_id}`,
      risk_level: riskLevel,
      reversibility,
      timeout_ms,
      context: {
        tool_id: ctx.tool_id,
        purpose: ctx.purpose,
        side_effect: sideEffect,
        session_id: ctx.session_id,
        canonical_user_id: ctx.canonical_user_id,
        metadata: ctx.metadata,
      },
      proposed_by: ctx.session_id ?? "unknown",
    });

    // Send notification
    await notifier.notify(request, "Remy");

    // Wait for approval
    const result = await waitForDecision(queue, request.id, timeout_ms);

    if (result === "approved") {
      return {
        decision: "allow",
        policy: effect,
      };
    }

    if (result === "denied") {
      return {
        decision: "deny",
        reason: "Approval denied by human",
      };
    }

    // Expired
    if (reversibility) {
      return {
        decision: "allow",
        policy: effect,
      };
    }

    return {
      decision: "deny",
      reason: "Approval request expired",
    };
  };
}

/**
 * Wait for a decision on an approval request.
 * Returns the final status.
 */
async function waitForDecision(
  queue: ApprovalQueue,
  requestId: string,
  timeoutMs: number
): Promise<ApprovalRequest["status"]> {
  const startTime = Date.now();
  const checkInterval = 500; // Check every 500ms

  while (Date.now() - startTime < timeoutMs) {
    const request = queue.get(requestId);
    if (!request) return "expired";
    if (request.status !== "pending") return request.status;

    await sleep(checkInterval);
  }

  return "expired";
}

/**
 * Sleep helper.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Factory to create a fully configured approval gate integrated with PolicyToolGate.
 */
export function createApprovalGateWithPolicyGate(
  policyGateConfig: Parameters<typeof createApprovalGate>[0]
): {
  approvalGate: AsyncToolGate;
  queue: ApprovalQueue;
  notifier: ApprovalNotifier;
} {
  const queue = policyGateConfig.queue;
  const notifier = policyGateConfig.notifier;
  const approvalGate = createApprovalGate(policyGateConfig);

  return { approvalGate, queue, notifier };
}
