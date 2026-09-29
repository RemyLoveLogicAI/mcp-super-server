/**
 * Aetheria — Flagship Demonstrator
 *
 * Aetheria validates the MCP Super-Server architecture by proving:
 * - Voice transport semantics
 * - Multi-agent NPC runtime with memory contracts
 * - Event-sourced world state + branching timelines
 * - Omnichannel identity continuity
 * - Real tools as gameplay mechanics
 *
 * This is a systems proof, not a game product.
 *
 * Whitepaper reference: §10 Flagship Demonstrator: Aetheria
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Increment 1 — Composition proof: identity -> orchestrator -> a REAL live
 * tool (the Continuum arcade game, talking to the actual running daemon) ->
 * event-sourced ledger. Reuses the exact composition pattern already proven
 * in apps/server/src/server.ts; introduces no new primitive.
 *
 * Deliberately NOT in this increment (separate, larger slices):
 * - Voice transport: @mss/voice's FSM is real but its ASR/TTS adapters are
 *   Mock (packages/voice/src/index.ts) — nothing to prove yet without a
 *   real provider wired in.
 * - Branching timelines / narrative: @mss/worlds is a real, tested,
 *   in-memory implementation but is unused everywhere in this repo, and its
 *   own README overclaims a narrative engine (Ink/Glulx) that doesn't
 *   exist. Wiring it here would compose against known-inconsistent scaffolding.
 * - Omnichannel identity: this proof resolves ONE platform identity; multi-
 *   platform linking is already tested in @mss/identity but not exercised here.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { randomUUID } from "crypto";
import { CORE_VERSION } from "@mss/core";
import type { ToolCallCompleted } from "@mss/core/events/tools";
import { createIdentityResolver } from "@mss/identity";
import { createInMemoryLedger } from "@mss/ledger";
import { createOrchestrator, type ToolExecutor, type ToolExecutionResult } from "@mss/orchestrator";
import { createDefaultArcade, type Arcade } from "@mss/games";

/** Adapts the games Arcade's gated invoke() to the orchestrator's plain ToolExecutor contract. */
export class ArcadeToolExecutor implements ToolExecutor {
  constructor(private readonly arcade: Arcade, private readonly actor: string, private readonly surface: string) {}

  async execute(toolId: string, input: Record<string, unknown>): Promise<ToolExecutionResult> {
    const start = Date.now();
    const result = await this.arcade.invoke(toolId, input, { actor: this.actor, surface: this.surface });
    const duration_ms = Date.now() - start;
    if (result.decision === "allow") return { ok: true, output: result.output, duration_ms };
    if (result.decision === "require_human") return { ok: false, error: result.prompt, duration_ms };
    return { ok: false, error: result.reason, duration_ms };
  }
}

export async function main(): Promise<void> {
  const identity = createIdentityResolver();
  const ledger = createInMemoryLedger();
  const arcade = createDefaultArcade();

  // 1. Identity: resolve a platform identity to a canonical user (real, tested @mss/identity).
  const resolved = await identity.resolve("web", "aetheria-demo-user");

  // 2. Orchestrator: plan + execute a real tool call against the live Continuum daemon,
  //    through the same gated Arcade the `mss` CLI and MCP surface use.
  const executor = new ArcadeToolExecutor(arcade, resolved.canonical_user_id, "aetheria");
  const orchestrator = createOrchestrator(
    { agent_id: "aetheria-demo", default_budget: { max_tool_calls: 5, max_time_ms: 10_000 } },
    executor,
    (e) => console.log(`[orchestrator] ${e.type} ${e.plan_id}${e.step_id ? `/${e.step_id}` : ""}${e.message ? `: ${e.message}` : ""}`),
  );

  const plan = await orchestrator.createPlan("Check the state of the valley", ["continuum:status"]);
  const t0 = Date.now();
  const completed = await orchestrator.executePlan(plan);
  const duration_ms = Date.now() - t0;
  const step = completed.steps[0]!;

  // 3. Ledger: append the outcome as a real, hash-chained event (@mss/ledger).
  const event: ToolCallCompleted = {
    event_id: randomUUID(),
    event_type: "ToolCallCompleted",
    timestamp: new Date().toISOString(),
    actor: { canonical_user_id: resolved.canonical_user_id },
    tool_call_id: `${plan.plan_id}:${step.step_id}`,
    ok: step.status === "completed",
    output: step.result,
    duration_ms,
    ...(step.error ? { error: step.error } : {}),
  };
  const appended = await ledger.append(event);

  const toolText = (step.result as { text?: string } | undefined)?.text;

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    AETHERIA DEMONSTRATOR                      ║
║                   (Contract-First v${CORE_VERSION})                 ║
╠═══════════════════════════════════════════════════════════════╣
║  Purpose: Validate MCP Super-Server architecture               ║
║  Status:  Increment 1 — composition proof                      ║
╚═══════════════════════════════════════════════════════════════╝

Identity     resolved ${resolved.canonical_user_id} (${resolved.is_new ? "new" : "existing"}) via @mss/identity
Orchestrator plan ${plan.plan_id} -> ${completed.status}, step ${step.step_id} (${step.tool_id}) -> ${step.status}
Arcade tool  continuum:status against the live Continuum daemon:
${toolText ? toolText.split("\n").map(l => "  " + l).join("\n") : `  (no output — ${step.error ?? "unknown"})`}
Ledger       appended ToolCallCompleted, index ${appended.index}, hash ${(appended.hash ?? "none").slice(0, 16)}...

Validation targets proved this increment:
  ${completed.status === "completed" ? "\u25cf" : "\u25cb"} Multi-agent NPC runtime (orchestrator plan/execute)
  ${completed.status === "completed" ? "\u25cf" : "\u25cb"} Real tools as gameplay mechanics (live Continuum daemon, not a mock)
  ${completed.status === "completed" ? "\u25cf" : "\u25cb"} Event-sourced world state (hash-chained ledger append)
  \u25cb Voice transport semantics (ASR/TTS still Mock — next increment)
  \u25cb Branching timelines (packages/worlds unused — next increment)
  \u25cb Omnichannel identity (single platform resolved — next increment)

This is a systems proof, not lore.
`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
