/**
 * @mss/games — Conduct orchestration through the Arcade surface.
 * Enables AI agents to conduct multi-step plans across all arcade tools
 * with DAG validation, data chaining, and budget enforcement.
 */
import {
  createOrchestrator,
  type ExecutionPlan,
  type PlanStep,
  type ToolExecutionResult,
  type ToolExecutor,
} from "@mss/orchestrator";
import { type Arcade } from "./arcade.js";

export interface ConductStepInput {
  tool_id: string;
  input?: Record<string, unknown> | undefined;
  depends_on?: string[] | undefined;
  continue_on_failure?: boolean | undefined;
}

export interface ConductOptions {
  actor?: string | undefined;
  surface?: string | undefined;
  max_tool_calls?: number | undefined;
  max_time_ms?: number | undefined;
  onStepComplete?: ((step: PlanStep) => void) | undefined;
}

export class ArcadeToolExecutor implements ToolExecutor {
  constructor(
    private readonly arcade: Arcade,
    private readonly actor: string = "orchestrator",
    private readonly surface: string = "mcp",
  ) {}

  async execute(toolId: string, input: Record<string, unknown>): Promise<ToolExecutionResult> {
    const start = Date.now();
    const result = await this.arcade.invoke(toolId, input, {
      actor: this.actor,
      surface: this.surface,
    });
    const duration_ms = Date.now() - start;

    if (result.decision === "allow") {
      return {
        ok: true,
        output: result.output.data !== undefined ? result.output.data : result.output.text,
        duration_ms,
      };
    }

    if (result.decision === "require_human") {
      return {
        ok: false,
        error: `Action requires human approval (${result.approval.id}): ${result.prompt}`,
        duration_ms,
      };
    }

    return {
      ok: false,
      error: result.reason,
      duration_ms,
    };
  }
}

export async function conductPlan(
  arcade: Arcade,
  goal: string,
  steps: Array<string | ConductStepInput>,
  opts: ConductOptions = {},
): Promise<ExecutionPlan> {
  const actor = opts.actor ?? "orchestrator";
  const surface = opts.surface ?? "mcp";
  const maxToolCalls = opts.max_tool_calls ?? Math.max(10, steps.length * 2);
  const maxTimeMs = opts.max_time_ms ?? 60_000;

  const executor = new ArcadeToolExecutor(arcade, actor, surface);
  const orchestrator = createOrchestrator(
    {
      agent_id: `agent-${actor}`,
      default_budget: {
        max_tool_calls: maxToolCalls,
        max_time_ms: maxTimeMs,
      },
    },
    executor,
  );

  const plan = await orchestrator.createPlan(goal, steps);
  return orchestrator.executePlan(plan, opts.onStepComplete);
}

export function formatConductResult(plan: ExecutionPlan): string {
  const lines: string[] = [
    `Orchestration Plan [${plan.plan_id.slice(0, 8)}] · ${plan.status.toUpperCase()}`,
    `Goal: ${plan.goal}`,
    "",
    "Steps:",
  ];

  for (const step of plan.steps) {
    const icon = step.status === "completed" ? "✓" : step.status === "failed" ? "✗" : "○";
    lines.push(`  ${icon} [${step.step_id}] ${step.tool_id} · ${step.status}`);
    if (step.error) {
      lines.push(`     Error: ${step.error}`);
    } else if (step.result !== undefined) {
      const resStr = typeof step.result === "string" ? step.result : JSON.stringify(step.result);
      const preview = resStr.length > 120 ? `${resStr.slice(0, 117)}...` : resStr;
      lines.push(`     Output: ${preview}`);
    }
  }

  const completed = plan.steps.filter((s) => s.status === "completed").length;
  lines.push("", `Summary: ${completed}/${plan.steps.length} steps completed successfully.`);
  return lines.join("\n");
}
