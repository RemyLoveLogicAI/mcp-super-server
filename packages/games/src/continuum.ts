/**
 * Continuum — a persistent valley whose history cannot be undone.
 *
 * This module is a client of the Continuum daemon (python -m continuum serve). The daemon is
 * the single writer; the super-server never holds world state, it only relays calls, so an
 * act made here is the same act every other Continuum surface (terminal, web, chat) sees.
 */
import type { WorldEventAppended } from "@mss/core/events/world";
import { GameError, type GameModule, type GameTool, type InvokeContext } from "./types.js";

const W = 32, H = 32, YEAR = 360;
const ACT: Record<string, string> = { plant: "plant_trees", cut: "cut_trees" };

export interface ContinuumOptions {
  url?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function createContinuumGame(opts: ContinuumOptions = {}): GameModule & { worldEvents(since?: number): Promise<WorldEventAppended[]> } {
  const base = (opts.url ?? process.env.CONTINUUM_URL ?? "http://127.0.0.1:7777").replace(/\/$/, "");
  const f = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 120_000;

  async function api(path: string, body?: unknown): Promise<any> {
    let r: Response;
    try {
      r = await f(base + path, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      } as RequestInit);
    } catch (e) {
      throw new GameError(`Continuum daemon unreachable at ${base}. Start it with: python -m continuum serve --world <dir>`, 503);
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new GameError(data.error ?? `HTTP ${r.status}`, r.status, data.since ? { since: data.since, based_on: data.based_on } : undefined);
    return data;
  }

  const when = (t: number) => `Y${Math.floor(t / YEAR)} d${t % YEAR}`;
  const fmtRecord = (r: any) => {
    const p = r.payload;
    return `#${r.seq} ${when(r.tick)} ${p.actor ?? "?"} via ${p.surface ?? "?"} ${p.type === "plant_trees" ? "planted" : "cut"} ${p.cells.length} — "${p.intent ?? ""}"`;
  };
  const cellsArg = { description: "Cells as text '12-15,4-6' (x range, y range) or '12,4 13,4', or [[x,y],...]. 32x32 grid; y=0 is the northern ridge; outlet at bottom centre.",
                     anyOf: [{ type: "string" }, { type: "array", items: { type: "array", items: { type: "integer" } } }] };

  const tool = (t: Omit<GameTool, "descriptor"> & { id: string; title: string; description: string; side: GameTool["descriptor"]["side_effect_class"]; caps: string[] }): GameTool => ({
    descriptor: { tool_id: `continuum:${t.id}`, version: "0.6.0", name: t.title, description: t.description,
                  capabilities: ["game", "continuum", ...t.caps], side_effect_class: t.side, available: true },
    inputSchema: t.inputSchema, handler: t.handler,
  });

  const tools: GameTool[] = [
    tool({ id: "status", title: "Continuum status", side: "read_only", caps: ["read"],
      description: "The shared valley right now: date, climate, trees, soil water, river, who is connected, and based_on (needed to commit).",
      inputSchema: { type: "object", properties: {} },
      handler: async (_i, ctx) => {
        const s = await api(`/api/state?actor=${encodeURIComponent(ctx.actor)}`);
        const surf = Object.entries(s.surfaces ?? {}).map(([k, v]) => `${k} ${v}`).join(", ") || "none";
        return { data: s, text:
          `Valley · ${when(s.tick)} · ${s.season} · climate ${s.climate_pct}% (${s.climate_phase})\n` +
          `trees ${s.trees} · soil ${s.soil_mm.toFixed(1)} mm · river ${s.river_ml.toFixed(1)} ML over ${s.river_days} days\n` +
          `${s.acts} acts · based_on=${s.based_on} · surfaces: ${surf}\n` +
          `influence for ${ctx.actor}: ${s.influence}/40` };
      } }),
    tool({ id: "map", title: "Continuum map", side: "read_only", caps: ["read"],
      description: "ASCII map of the valley: trees, river, soil water.",
      inputSchema: { type: "object", properties: {} },
      handler: async () => {
        const v = await api("/api/view");
        const rows: string[] = [];
        for (let y = 0; y < H; y++) {
          let row = "";
          for (let x = 0; x < W; x++) {
            const i = y * W + x, t = +v.tree[i], w = +v.water[i], s = +v.soil[i];
            row += t >= 5 ? "♣" : t > 0 ? "•" : w >= 4 ? "≈" : w >= 2 ? "~" : " .:-=+*#%@"[Math.min(9, s)];
          }
          rows.push(row);
        }
        return { data: v, text: rows.join("\n") + "\nlegend: ♣ mature tree  • young tree  ≈ river  ~ runoff  .:-=+*#% soil water (dry→wet)" };
      } }),
    tool({ id: "changes", title: "Continuum changes since", side: "read_only", caps: ["read"],
      description: "Acts committed by anyone, from any surface, after ledger seq `since`.",
      inputSchema: { type: "object", properties: { since: { type: "integer", minimum: 0 } }, required: ["since"] },
      handler: async (i) => {
        const recs = (await api(`/api/ledger?since=${Number(i.since) + 1}`)).records.filter((r: any) => r.kind === "intervention");
        return { data: recs, text: recs.map(fmtRecord).join("\n") || "Nothing new." };
      } }),
    tool({ id: "forecast", title: "Continuum forecast", side: "read_only", caps: ["read", "simulate"],
      description: "Sandbox a plant or cut for 10 simulated years. Never written to history.",
      inputSchema: { type: "object", properties: { action: { type: "string", enum: ["plant", "cut"] }, cells: cellsArg }, required: ["action", "cells"] },
      handler: async (i) => {
        const r = await api("/api/forecast", { type: ACT[String(i.action)], cells: i.cells });
        return { data: r, text: `Forecast to ${when(r.until)} (sandbox): river ${r.d_river_ml >= 0 ? "+" : ""}${r.d_river_ml.toFixed(1)} ML, trees ${r.d_trees >= 0 ? "+" : ""}${r.d_trees}` +
                                  (r.descendants != null ? `, descendants ${r.descendants}` : "") };
      } }),
    tool({ id: "why", title: "Continuum why", side: "read_only", caps: ["read", "counterfactual"],
      description: "Counterfactual attribution for one hectare: replays history without each past act. Slow.",
      inputSchema: { type: "object", properties: { x: { type: "integer" }, y: { type: "integer" } }, required: ["x", "y"] },
      handler: async (i) => ({ text: (await api(`/api/why?x=${Number(i.x)}&y=${Number(i.y)}`)).text }) }),
    tool({ id: "commit", title: "Continuum commit (permanent)", side: "irreversible_write", caps: ["write", "irreversible"],
      description: "PERMANENTLY plant or cut in the shared valley. Every surface inherits it and it can never be undone. " +
                   "Needs a human approval (mss approve <id>). Forecast first. `intent` is recorded forever. " +
                   "`based_on` comes from continuum_status; if anyone acted since, the commit is refused with what changed.",
      inputSchema: { type: "object", properties: {
          action: { type: "string", enum: ["plant", "cut"] }, cells: cellsArg,
          intent: { type: "string", minLength: 6, maxLength: 160 }, based_on: { type: "integer" },
          approval_id: { type: "string", description: "From the approval request, after a human approved it." } },
        required: ["action", "cells", "intent", "based_on"] },
      handler: async (i, ctx: InvokeContext) => {
        const out = await api("/api/commit", { type: ACT[String(i.action)], cells: i.cells, intent: i.intent,
                                                actor: ctx.actor, surface: "mss", based_on: i.based_on });
        return { data: out, text: `Committed permanently. ${fmtRecord(out.record)}\nledger hash ${out.record.hash.slice(0, 16)}… · influence left ${out.influence}/40` };
      } }),
  ];

  return {
    id: "continuum", name: "Continuum", status: "live", tools,
    description: "Persistent valley simulation. Interventions become permanent history; shadow valleys measure their consequences.",
    async health() {
      try { const s = await api("/api/state"); return { ok: true, detail: `${when(s.tick)} · ${s.acts} acts · head ${String(s.head).slice(0, 12)}` }; }
      catch (e) { return { ok: false, detail: (e as Error).message }; }
    },
    /** Continuum acts as core WorldEventAppended events, e.g. to mirror into the super-server ledger. */
    async worldEvents(since = 0) {
      const { records } = await api(`/api/ledger?since=${since}`);
      return records.filter((r: any) => r.kind === "intervention").map((r: any): WorldEventAppended => ({
        event_id: `continuum:${r.hash.slice(0, 24)}`, event_type: "WorldEventAppended",
        timestamp: new Date().toISOString(),
        actor: { canonical_user_id: r.payload.actor, platform: r.payload.surface },
        prev_hash: r.prev, hash: r.hash,
        world_id: "continuum:valley", timeline_id: "main", event_index: r.seq,
        world_event_type: `intervention.${r.payload.type}`,
        payload: { tick: r.tick, cells: r.payload.cells, intent: r.payload.intent },
      }));
    },
  };
}
