/**
 * @mss/vigil — Meta-Prompting Engine
 */

import type { DetectedError, FixStrategy, RepairAction } from "./types.js";
import type { DiagnosisEngine } from "./diagnosis.js";
import type { ErrorDetector } from "./detector.js";
import type { RepairActionType, Subsystem } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────

export interface MetaConfig {
  selfConsistencyCount?: number;
  minConfidence?: number;
  enableChainOfThought?: boolean;
}

export interface StrategyContext {
  error: DetectedError;
  recentActions?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────

export class MetaPromptingEngine {
  private config: Required<MetaConfig>;
  private diagnosisEngine: DiagnosisEngine | null = null;
  private errorDetector: ErrorDetector | null = null;

  constructor(config: MetaConfig = {}) {
    this.config = {
      selfConsistencyCount: config.selfConsistencyCount ?? 3,
      minConfidence: config.minConfidence ?? 0.6,
      enableChainOfThought: config.enableChainOfThought ?? true,
    };
  }

  setDiagnosisEngine(engine: DiagnosisEngine): void {
    this.diagnosisEngine = engine;
  }

  setErrorDetector(detector: ErrorDetector): void {
    this.errorDetector = detector;
  }

  async generateStrategies(context: StrategyContext): Promise<FixStrategy[]> {
    const candidates: FixStrategy[] = [];

    for (let i = 0; i < this.config.selfConsistencyCount; i++) {
      const candidate = await this.generateCandidate(context, i);
      candidates.push(candidate);
    }

    const actionFrequency = new Map<string, number>();
    for (const candidate of candidates) {
      for (const action of candidate.actions) {
        const key = `${action.type}:${action.target ?? "global"}`;
        actionFrequency.set(key, (actionFrequency.get(key) ?? 0) + 1);
      }
    }

    for (const candidate of candidates) {
      candidate.self_consistency_score = this.computeSelfConsistencyScore(candidate, actionFrequency);
    }

    candidates.sort((a, b) => {
      const scoreA = a.confidence * (a.self_consistency_score ?? 0.5);
      const scoreB = b.confidence * (b.self_consistency_score ?? 0.5);
      return scoreB - scoreA;
    });

    return candidates;
  }

  private async generateCandidate(
    context: StrategyContext,
    seed: number
  ): Promise<FixStrategy> {
    const id = crypto.randomUUID();
    const chainOfThought: string[] = [];
    const { error } = context;

    chainOfThought.push(`[Step 1] Error: "${error.message}" (${error.count} occurrences)`);
    chainOfThought.push(`[Step 1] Subsystem: ${error.subsystem}`);
    chainOfThought.push(`[Step 1] Severity: ${error.severity}, Persistence: ${error.persistence}`);

    let solutions: string[] = [];
    let confidence = 0.5;

    if (this.diagnosisEngine) {
      const knowledge = this.diagnosisEngine.getKnowledge(error.pattern_id);
      if (knowledge) {
        solutions = knowledge.solutions.map((s) => s.description);
        confidence = knowledge.default_confidence;
        chainOfThought.push(`[Step 2] Matched pattern: ${error.pattern_id}`);
        chainOfThought.push(`[Step 2] Known solutions: ${solutions.join("; ")}`);
      } else {
        chainOfThought.push(`[Step 2] No pattern match — inferring from error characteristics`);
        solutions = this.inferSolutions(context);
      }
    } else {
      solutions = this.inferSolutions(context);
    }

    const recentActionsStr = context.recentActions?.join(", ") ?? "none";
    chainOfThought.push(`[Step 3] Recent actions taken: ${recentActionsStr}`);

    const filteredSolutions = this.filterByRecentHistory(solutions, context.recentActions ?? []);
    chainOfThought.push(`[Step 4] After filtering: ${filteredSolutions.join(", ")}`);
    chainOfThought.push(`[Step 5] Selecting best action sequence based on impact and reversibility`);

    const actions = this.buildActions(filteredSolutions, error.subsystem, seed);
    const description = `Fix ${error.pattern_id}: ${filteredSolutions.join(" → ")}`;

    if (error.severity === "critical") {
      confidence = Math.min(0.95, confidence + 0.1);
    }
    if (error.count > 3) {
      confidence = Math.min(0.9, confidence + 0.05);
    }

    return {
      id,
      description,
      actions,
      confidence,
      chain_of_thought: chainOfThought,
    };
  }

  private inferSolutions(context: StrategyContext): string[] {
    const solutions: string[] = [];
    const { error } = context;

    if (error.message.toLowerCase().includes("timeout")) {
      solutions.push("retry_with_backoff", "restart_service");
    }
    if (error.message.toLowerCase().includes("connection refused")) {
      solutions.push("restart_service", "check_service_status");
    }
    if (error.message.toLowerCase().includes("memory") || error.message.toLowerCase().includes("oom")) {
      solutions.push("restart_service", "clear_cache");
    }
    if (error.message.toLowerCase().includes("session") && error.message.toLowerCase().includes("expired")) {
      solutions.push("refresh_session");
    }
    if (error.message.toLowerCase().includes("invalid") && error.message.toLowerCase().includes("state")) {
      solutions.push("reset_session", "restart_component");
    }

    if (solutions.length === 0) {
      solutions.push("restart_service", "notify");
    }

    return [...new Set(solutions)];
  }

  private filterByRecentHistory(solutions: string[], recentActions: string[]): string[] {
    const recentSet = new Set(recentActions);
    const filtered = solutions.filter((s) => !recentSet.has(s));
    if (filtered.length === 0) {
      return ["restart_service"];
    }
    return filtered;
  }

  private buildActions(
    solutionIds: string[],
    subsystem: Subsystem,
    seed: number
  ): RepairAction[] {
    const typeMap: Record<string, RepairActionType> = {
      retry_with_backoff: "custom",
      restart_service: "restart_service",
      clear_cache: "clear_cache",
      reset_session: "reset_session",
      restart_ledger: "restart_component",
      restart_orchestrator: "restart_component",
      restart_voice_component: "restart_component",
      refresh_tool_registry: "clear_cache",
      refresh_session: "reset_session",
      re_authenticate: "reset_session",
      backoff: "custom",
      notify: "notify",
    };

    const shuffled = [...solutionIds].sort(() => (seed % 2 === 0 ? 1 : -1));

    return shuffled.map((id, index) => ({
      id: `${id}_${index}`,
      type: typeMap[id] ?? "custom",
      description: id,
      target: subsystem,
    }));
  }

  private computeSelfConsistencyScore(
    candidate: FixStrategy,
    actionFrequency: Map<string, number>
  ): number {
    if (candidate.actions.length === 0) return 0;

    let totalFrequency = 0;
    for (const action of candidate.actions) {
      const key = `${action.type}:${action.target ?? "global"}`;
      totalFrequency += actionFrequency.get(key) ?? 0;
    }

    return totalFrequency / (candidate.actions.length * this.config.selfConsistencyCount);
  }

  selectBest(candidates: FixStrategy[]): FixStrategy | null {
    if (candidates.length === 0) return null;

    const filtered = candidates.filter(
      (c) => c.confidence >= this.config.minConfidence
    );

    if (filtered.length === 0) {
      return candidates[0] ?? null;
    }

    return filtered[0] ?? null;
  }
}
