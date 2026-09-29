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
export interface RequestedTool {
  tool_id: string;
  input?: Record<string, unknown> | undefined;
  depends_on?: string[] | undefined;
  continue_on_failure?: boolean | undefined;
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

function validatePlanDAG(steps: PlanStep[]): void {
  const stepIds = new Set(steps.map((s) => s.step_id));
  for (const step of steps) {
    for (const dep of step.depends_on ?? []) {
      if (dep === step.step_id) {
        throw new Error(`Step ${step.step_id} cannot depend on itself`);
      }
      if (!stepIds.has(dep)) {
        throw new Error(`Step ${step.step_id} references nonexistent dependency: ${dep}`);
      }
    }
  }

  // Cycle detection via DFS
  const visited = new Map<string, "visiting" | "visited">();
  const graph = new Map<string, string[]>();
  for (const step of steps) {
    graph.set(step.step_id, step.depends_on ?? []);
  }

  function dfs(node: string, path: string[]): void {
    visited.set(node, "visiting");
    path.push(node);
    for (const dep of graph.get(node) ?? []) {
      const state = visited.get(dep);
      if (state === "visiting") {
        const cycle = [...path.slice(path.indexOf(dep)), dep];
        throw new Error(`Circular dependency detected in plan: ${cycle.join(" -> ")}`);
      }
      if (!state) {
        dfs(dep, path);
      }
    }
    path.pop();
    visited.set(node, "visited");
  }

  for (const step of steps) {
    if (!visited.has(step.step_id)) {
      dfs(step.step_id, []);
    }
  }
}

function sortStepsTopologically(steps: PlanStep[]): PlanStep[] {
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  const stepMap = new Map<string, PlanStep>();

  for (const s of steps) {
    stepMap.set(s.step_id, s);
    inDegree.set(s.step_id, (s.depends_on ?? []).length);
    for (const dep of s.depends_on ?? []) {
      if (!dependents.has(dep)) dependents.set(dep, []);
      dependents.get(dep)!.push(s.step_id);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const sorted: PlanStep[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(stepMap.get(id)!);
    for (const nextId of dependents.get(id) ?? []) {
      const newDeg = inDegree.get(nextId)! - 1;
      inDegree.set(nextId, newDeg);
      if (newDeg === 0) queue.push(nextId);
    }
  }

  return sorted.length === steps.length ? sorted : steps;
}

function getNestedValue(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  if (!path) return obj;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function interpolateValue(val: unknown, outputs: Map<string, unknown>): unknown {
  if (typeof val === "string") {
    const exactMatch = val.match(/^\{\{([a-zA-Z0-9_-]+)\.(?:output|result)(?:\.([^}]+))?\}\}$/);
    if (exactMatch && exactMatch[1]) {
      const stepId = exactMatch[1];
      const propPath = exactMatch[2];
      const output = outputs.get(stepId);
      return propPath ? getNestedValue(output, propPath) : output;
    }
    return val.replace(/\{\{([a-zA-Z0-9_-]+)\.(?:output|result)(?:\.([^}]+))?\}\}/g, (_, stepId: string, propPath?: string) => {
      const output = outputs.get(stepId);
      const res = propPath ? getNestedValue(output, propPath) : output;
      return res !== undefined && res !== null ? (typeof res === "object" ? JSON.stringify(res) : String(res)) : "";
    });
  }
  if (Array.isArray(val)) {
    return val.map((item) => interpolateValue(item, outputs));
  }
  if (val !== null && typeof val === "object") {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      res[k] = interpolateValue(v, outputs);
    }
    return res;
  }
  return val;
}

function normalizeRequestedTools(
  requestedTools: Array<string | RequestedTool>,
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
    requestedTools: Array<string | RequestedTool>,
  ): Promise<ExecutionPlan> {
    if (!goal.trim()) throw new Error("Goal cannot be empty");
    if (!requestedTools.length) throw new Error("At least one tool is required to create a plan");
    if (requestedTools.length > this.config.default_budget.max_tool_calls) {
      throw new Error(`Requested tool count exceeds budget: ${requestedTools.length} > ${this.config.default_budget.max_tool_calls}`);
    }

    const steps = normalizeRequestedTools(requestedTools);
    validatePlanDAG(steps);

    const plan: ExecutionPlan = {
      plan_id: crypto.randomUUID(),
      agent_id: this.config.agent_id,
      goal: goal.trim(),
      steps,
      budget: { ...this.config.default_budget },
      status: "pending",
      created_at: new Date().toISOString(),
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
    const completedOutputs = new Map<string, unknown>();
    plan.status = "executing";
    this.logger?.({ type: "plan_started", plan_id: plan.plan_id, message: "Plan execution started" });

    const executionOrder = sortStepsTopologically(plan.steps);
    for (const step of executionOrder) {
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

      const resolvedInput = (interpolateValue(step.input, completedOutputs) ?? {}) as Record<string, unknown>;
      const result = await this.toolExecutor.execute(step.tool_id, resolvedInput);
      calls += 1;

      if (result.ok) {
        step.status = "completed";
        step.result = result.output;
        completedSteps.add(step.step_id);
        completedOutputs.set(step.step_id, result.output);
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
        plan.completed_at = new Date().toISOString();
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
    plan.completed_at = new Date().toISOString();
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
