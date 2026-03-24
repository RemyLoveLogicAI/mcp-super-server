/**
 * Tool Gate Policies.
 * Whitepaper §7.4: Human-in-the-loop Gates
 * 
 * Gates control whether tool calls are allowed, blocked,
 * or require human approval.
 */

import type { EffectPolicy } from "./effects.js";
import type { SessionId } from "../ids";

// ─────────────────────────────────────────────────────────────────────────────
// Gate Decision Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of evaluating a tool gate.
 */
export type ToolGateDecision =
  | { 
      decision: "allow"; 
      policy: EffectPolicy;
    }
  | { 
      decision: "deny"; 
      reason: string | object;
    }
  | { 
      decision: "require_human"; 
      policy: EffectPolicy;
      /** Prompt to show the human for approval */
      prompt: string;
    };

// ─────────────────────────────────────────────────────────────────────────────
// Gate Context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context provided to gate evaluation.
 */
export type GateContext = {
  /** Canonical user making the request (if known) */
  canonical_user_id?: string;
  
  /** Session this request is part of */
  session_id?: SessionId;
  
  /** Tool being invoked */
  tool_id: string;
  
  /** Human-readable purpose of the invocation */
  purpose: string;
  
  /** Requested effect policy */
  requested_effect: EffectPolicy;
  
  /** Capability scopes being requested */
  scopes?: string[];
  
  /** Additional metadata for policy evaluation */
  metadata?: Record<string, unknown>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Gate Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A tool gate function.
 * Implementations evaluate context and return a decision.
 */
export type ToolGate = (ctx: GateContext) => ToolGateDecision;

/**
 * Async variant for gates that need external lookups.
 */
export type AsyncToolGate = (ctx: GateContext) => Promise<ToolGateDecision>;

// ─────────────────────────────────────────────────────────────────────────────
// Gate Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a gate that always allows.
 */
export function allowAllGate(policy: EffectPolicy): ToolGate {
  return () => ({ decision: "allow", policy });
}

/**
 * Create a gate that always denies.
 */
export function denyAllGate(reason: string): ToolGate {
  return () => ({ decision: "deny", reason });
}

/**
 * Create a gate that always requires human approval.
 */
export function requireHumanGate(policy: EffectPolicy, prompt: string): ToolGate {
  return () => ({ decision: "require_human", policy, prompt });
}

/**
 * Compose multiple gates (all must allow).
 */
export function composeGates(...gates: ToolGate[]): ToolGate {
  return (ctx: GateContext): ToolGateDecision => {
    for (const gate of gates) {
      const decision = gate(ctx);
      if (decision.decision !== "allow") {
        return decision;
      }
    }
    // All gates allowed - return the last policy
    return gates.length > 0 
      ? gates[gates.length - 1]!(ctx) 
      : { decision: "allow", policy: ctx.requested_effect };
  };
}
