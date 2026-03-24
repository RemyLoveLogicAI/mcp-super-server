/**
 * @mss/orchestrator - Agent Orchestrator
 * Whitepaper §4.2.4 + Patent Surface #3
 */

export type PlanStatus = "pending" | "executing" | "completed" | "failed" | "cancelled";

export interface ExecutionPlan {
  plan_id: string;
  agent_id: string;
  goal: string;
  steps: PlanStep[];
  budget: PlanBudget;
  status: PlanStatus;
  created_at: string;
  completed_at?: string;
}

export interface PlanStep {
  step_id: string;
  tool_id: string;
  input: Record<string, unknown>;
  depends_on?: string[];
  continue_on_failure?: boolean;
  status: "pending" | "executing" | "completed" | "failed" | "skipped";
  result?: unknown;
  error?: string;
}

export interface PlanBudget {
  max_tool_calls: number;
  max_cost_units?: number;
  max_time_ms?: number;
}

export interface OrchestratorConfig {
  agent_id: string;
  default_budget: PlanBudget;
}

export interface ToolExecutionResult {
  ok: boolean;
  output?: unknown;
  error?: string;
  duration_ms?: number;
}

export interface ToolExecutor {
  execute(tool_id: string, input: Record<string, unknown>): Promise<ToolExecutionResult>;
}

export type StepCallback = (step: PlanStep) => void;

export type OrchestratorLogger = (event: {
  type: "plan_created" | "plan_started" | "step_started" | "step_completed" | "step_failed" | "plan_completed" | "plan_failed";
  plan_id: string;
  step_id?: string;
  tool_id?: string;
  message?: string;
  data?: Record<string, unknown>;
}) => void;

function now() {
  return new Date().toISOString();
}

function normalizeRequestedTools(
  requestedTools: Array<string | { tool_id: string; input?: Record<string, unknown>; depends_on?: string[]; continue_on_failure?: boolean }>,
): PlanStep[] {
  return requestedTools.map((tool, index) => {
    if (typeof tool === "string") {
      return {
        step_id: `step-${index + 1}`,
        tool_id: tool,
        input: {},
        status: "pending" as const,
      };
    }

    if (!tool.tool_id.trim()) {
      throw new Error(`Step ${index + 1} has an empty tool_id`);
    }

    const dependsOn = tool.depends_on?.length ? [...tool.depends_on] : undefined;
    return {
      step_id: `step-${index + 1}`,
      tool_id: tool.tool_id,
      input: tool.input ?? {},
      ...(dependsOn ? { depends_on: dependsOn } : {}),
      continue_on_failure: tool.continue_on_failure ?? false,
      status: "pending" as const,
    };
  });
}

export class AgentOrchestrator {
  private config: OrchestratorConfig;
  private toolExecutor: ToolExecutor;
  private logger?: OrchestratorLogger;
  private plans = new Map<string, ExecutionPlan>();

  constructor(config: OrchestratorConfig, toolExecutor: ToolExecutor, logger?: OrchestratorLogger) {
    this.config = config;
    this.toolExecutor = toolExecutor;
    if (logger !== undefined) {
      this.logger = logger;
    }
  }

  async createPlan(
    goal: string,
    requestedTools: Array<string | { tool_id: string; input?: Record<string, unknown>; depends_on?: string[]; continue_on_failure?: boolean }>,
  ): Promise<ExecutionPlan> {
    if (!goal.trim()) throw new Error("Goal cannot be empty");
    if (!requestedTools.length) throw new Error("At least one tool is required to create a plan");
    if (requestedTools.length > this.config.default_budget.max_tool_calls) {
      throw new Error(`Requested tool count exceeds budget: ${requestedTools.length} > ${this.config.default_budget.max_tool_calls}`);
    }

    const plan: ExecutionPlan = {
      plan_id: crypto.randomUUID(),
      agent_id: this.config.agent_id,
      goal: goal.trim(),
      steps: normalizeRequestedTools(requestedTools),
      budget: { ...this.config.default_budget },
      status: "pending",
      created_at: now(),
    };

    this.plans.set(plan.plan_id, plan);
    this.logger?.({ type: "plan_created", plan_id: plan.plan_id, message: "Plan created", data: { step_count: plan.steps.length } });
    return plan;
  }

  async executePlan(planOrId: ExecutionPlan | string, onStepComplete?: StepCallback): Promise<ExecutionPlan> {
    const plan = typeof planOrId === "string" ? this.plans.get(planOrId) : planOrId;
    if (!plan) throw new Error(typeof planOrId === "string" ? `Plan ${planOrId} not found` : "Plan not found");
    if (plan.status === "executing") throw new Error(`Plan ${plan.plan_id} is already executing`);

    const startedAt = Date.now();
    let calls = 0;
    const completedSteps = new Set<string>();
    plan.status = "executing";
    this.logger?.({ type: "plan_started", plan_id: plan.plan_id, message: "Plan execution started" });

    for (const step of plan.steps) {
      const currentStatus = plan.status as PlanStatus;
      if (currentStatus === "cancelled") break;
      if (calls >= plan.budget.max_tool_calls) {
        step.status = "failed";
        step.error = `Tool call budget exceeded (${plan.budget.max_tool_calls})`;
        plan.status = "failed";
        break;
      }
      if (plan.budget.max_time_ms !== undefined && Date.now() - startedAt > plan.budget.max_time_ms) {
        step.status = "failed";
        step.error = `Execution time budget exceeded (${plan.budget.max_time_ms}ms)`;
        plan.status = "failed";
        break;
      }
      if (step.depends_on?.some((dep) => !completedSteps.has(dep))) {
        step.status = "failed";
        step.error = `Unmet dependencies: ${step.depends_on.filter((dep) => !completedSteps.has(dep)).join(", ")}`;
        if (!step.continue_on_failure) {
          plan.status = "failed";
          break;
        }
        continue;
      }

      step.status = "executing";
      this.logger?.({ type: "step_started", plan_id: plan.plan_id, step_id: step.step_id, tool_id: step.tool_id, message: `Executing ${step.tool_id}` });

      const result = await this.toolExecutor.execute(step.tool_id, step.input);
      calls += 1;

      if (result.ok) {
        step.status = "completed";
        step.result = result.output;
        completedSteps.add(step.step_id);
        onStepComplete?.(step);
        this.logger?.({ type: "step_completed", plan_id: plan.plan_id, step_id: step.step_id, tool_id: step.tool_id, message: `Completed ${step.tool_id}`, data: { duration_ms: result.duration_ms } });
      } else {
        step.status = "failed";
        step.error = result.error ?? "Unknown error";
        onStepComplete?.(step);
        this.logger?.({ type: "step_failed", plan_id: plan.plan_id, step_id: step.step_id, tool_id: step.tool_id, message: step.error });
        if (!step.continue_on_failure) {
          plan.status = "failed";
          break;
        }
      }

      const postStepStatus = plan.status as PlanStatus;
      if (postStepStatus === "cancelled") break;
    }

    const finalStatus = plan.status as PlanStatus;
    if (finalStatus !== "failed" && finalStatus !== "cancelled") {
      const allDone = plan.steps.every((step) => step.status === "completed" || step.status === "skipped");
      plan.status = allDone ? "completed" : "failed";
      if (plan.status === "completed") {
        plan.completed_at = now();
        this.logger?.({ type: "plan_completed", plan_id: plan.plan_id, message: "Plan completed", data: { duration_ms: Date.now() - startedAt } });
      }
    }

    this.plans.set(plan.plan_id, plan);
    return plan;
  }

  cancelPlan(plan_id: string): ExecutionPlan {
    const plan = this.plans.get(plan_id);
    if (!plan) throw new Error(`Plan ${plan_id} not found`);
    plan.status = "cancelled";
    plan.completed_at = now();
    this.plans.set(plan_id, plan);
    this.logger?.({ type: "plan_failed", plan_id, message: "Plan cancelled" });
    return plan;
  }

  getPlan(plan_id: string): ExecutionPlan | undefined {
    return this.plans.get(plan_id);
  }
}

export function createOrchestrator(config: OrchestratorConfig, executor: ToolExecutor, logger?: OrchestratorLogger): AgentOrchestrator {
  return new AgentOrchestrator(config, executor, logger);
}
