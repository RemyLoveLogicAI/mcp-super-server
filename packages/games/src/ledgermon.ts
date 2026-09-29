/**
 * LEDGERMON — familiar battles for the agent roster.
 *
 * A TypeScript port of packages/engine/src/battle.rs (execute_familiar_battle) with the same
 * rules, so the battle is playable through the arcade today. The Rust crate has no Cargo.toml
 * in this repo, so the WASM build cannot run yet; when it can, swap the handler to call it and
 * keep these tests as the parity check.
 *
 * One deliberate difference: battle.rs returns a fixed mock hash ("sha256-battle-2a"). This port
 * returns a real SHA-256 over the inputs and outcome, so identical battles hash identically.
 */
import { createHash } from "node:crypto";
import { GameError, type GameModule, type GameTool } from "./types.js";

export interface FamiliarStats { spd: number; sta: number; acc: number; tem: number; app: number }
export interface BattleOutcome { winner_did: string; battle_log: string[]; xp_gained: number; deterministic_hash: string }

const f32 = Math.fround;

export function executeFamiliarBattle(aDid: string, a: FamiliarStats, bDid: string, b: FamiliarStats): BattleOutcome {
  const log = [`[Battle] ${aDid} vs ${bDid}`];
  const first = f32(a.spd) >= f32(b.spd) ? aDid : bDid;                       // Phase 1: initiative
  log.push(`[Initiative] ${first} takes the lead.`);
  const power = (s: FamiliarStats) => f32(f32(s.acc) * f32(1 - f32(f32(s.tem) / 100)));   // Phase 2: acc × (1 − tem/100)
  const winner = power(a) >= power(b) ? aDid : bDid;
  log.push(`[Verdict] ${winner} dominates the logic stream.`);
  const deterministic_hash = "sha256-" + createHash("sha256").update(JSON.stringify([aDid, a, bDid, b, winner])).digest("hex");
  return { winner_did: winner, battle_log: log, xp_gained: 250, deterministic_hash };
}

const statsSchema = { type: "object", properties: Object.fromEntries(["spd", "sta", "acc", "tem", "app"].map(k => [k, { type: "number", minimum: 0, maximum: 100 }])),
                      required: ["spd", "sta", "acc", "tem", "app"] };

function parseStats(v: unknown, who: string): FamiliarStats {
  const o = (typeof v === "string" ? Object.fromEntries(v.split(",").map(kv => kv.split("=").map(s => s.trim()))) : v) as Record<string, unknown>;
  const out: any = {};
  for (const k of ["spd", "sta", "acc", "tem", "app"]) {
    const n = Number(o?.[k]);
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new GameError(`${who}.${k} must be a number from 0 to 100`);
    out[k] = n;
  }
  return out;
}

export function createLedgermonGame(): GameModule {
  const battle: GameTool = {
    descriptor: { tool_id: "ledgermon:battle", version: "0.1.0", name: "LEDGERMON battle", side_effect_class: "read_only",
                  description: "Battle two agent familiars. Stats 0-100: spd (latency), sta (tokens), acc (eval accuracy), tem (escalation temperament), app (cost appetite). Initiative by spd; winner by acc × (1 − tem/100). Deterministic.",
                  capabilities: ["game", "ledgermon", "simulate"], available: true },
    inputSchema: { type: "object", properties: { a_did: { type: "string" }, a: statsSchema, b_did: { type: "string" }, b: statsSchema }, required: ["a_did", "a", "b_did", "b"] },
    handler: async (i) => {
      const o = executeFamiliarBattle(String(i.a_did), parseStats(i.a, "a"), String(i.b_did), parseStats(i.b, "b"));
      return { data: o, text: `${o.battle_log.join("\n")}\nwinner ${o.winner_did} · +${o.xp_gained} XP · ${o.deterministic_hash.slice(0, 23)}…` };
    },
  };
  return { id: "ledgermon", name: "LEDGERMON", status: "live", tools: [battle],
           description: "Covenant Familiars: Pokémon-style battles and XP for the agent roster.",
           async health() { return { ok: true, detail: "battle rules ported from engine/battle.rs (WASM build pending)" }; } };
}

export function createAetheriaGame(): GameModule {
  return { id: "aetheria", name: "Aetheria", status: "scaffold", tools: [],
           description: "Flagship demonstrator (apps/aetheria). Scaffold only; no playable tools yet.",
           async health() { return { ok: true, detail: "scaffold" }; } };
}
