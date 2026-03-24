/**
 * Side Effect Policies.
 * Whitepaper §7: Security Model
 * 
 * Tools are classified by their side effects:
 * - read_only: No state mutation
 * - reversible_write: Can be undone
 * - irreversible_write: Cannot be undone
 */

// ─────────────────────────────────────────────────────────────────────────────
// Type Definitions (non-Zod for contracts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classification of a tool's side effects.
 */
export type SideEffectClass = 
  | "read_only"           // No state mutation
  | "reversible_write"    // Can be undone
  | "irreversible_write"; // Cannot be undone

/**
 * Approval policy for tool invocation.
 */
export type ApprovalPolicy = 
  | "auto"           // Execute without human approval
  | "require_human"  // Must get human confirmation
  | "blocked";       // Never allowed

/**
 * Combined effect policy.
 */
export type EffectPolicy = {
  /** Side effect classification */
  sideEffect: SideEffectClass;
  
  /** Approval required */
  approval: ApprovalPolicy;
};

// ─────────────────────────────────────────────────────────────────────────────
// Policy Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default effect policies by side effect class.
 * Whitepaper §7.4: Human-in-the-loop Gates
 */
export const DEFAULT_EFFECT_POLICIES: Record<SideEffectClass, EffectPolicy> = {
  read_only: {
    sideEffect: "read_only",
    approval: "auto"
  },
  reversible_write: {
    sideEffect: "reversible_write",
    approval: "auto"
  },
  irreversible_write: {
    sideEffect: "irreversible_write",
    approval: "require_human"
  }
};

/**
 * Check if a side effect class requires human approval by default.
 */
export function requiresHumanApproval(sideEffect: SideEffectClass): boolean {
  return sideEffect === "irreversible_write";
}

/**
 * Check if an effect policy allows automatic execution.
 */
export function isAutoApproved(policy: EffectPolicy): boolean {
  return policy.approval === "auto";
}
