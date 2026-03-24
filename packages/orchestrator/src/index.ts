/**
 * @mss/orchestrator — Agent Orchestrator
 * Whitepaper §4.2.4
 */

export type {
  ToolCallRequested,
  ToolCallCompleted,
  ToolCallCanceled
} from "@mss/core/events";

export type {
  ToolCallRequest,
  ToolCallResult
} from "@mss/core/contracts";

export type {
  ToolGate,
  GateContext,
  ToolGateDecision
} from "@mss/core/policies";

// ─────────────────────────────────────────────────────────────────────────────
// Actual implementations
// ─────────────────────────────────────────────────────────────────────────────

export { AgentOrchestrator, createOrchestrator } from "./orchestrator.js";
export type {
  ExecutionPlan,
  PlanStep,
  PlanBudget,
  OrchestratorConfig,
  PlanStatus,
  ToolExecutor,
  ToolExecutionResult,
  OrchestratorLogger,
  StepCallback,
} from "./orchestrator.js";

export { RealToolExecutor } from "./tool_executor.js";
export type { ToolExecutor as ToolInvoker } from "./tool_executor.js";
