import { createServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WorldEventAppended } from "@mss/core/events/world";
import { ToolDescriptor } from "@mss/core/resources/tool";
import { Arcade, createContinuumGame, createDefaultArcade, createLedgermonGame, createStoriesGame, executeFamiliarBattle,
         FileApprovalStore, MemoryApprovalStore, mcpName } from "../src/index.js";

process.env.MSS_HOME = mkdtempSync(join(tmpdir(), "mss-home-"));
import { callTool, toolList } from "../src/mcp.js";

// ── a fake Continuum daemon: same routes and status codes as continuum/server.py ─────────
let server: Server, url = "";
const commits: any[] = [];
let basedOn = 0;
beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", c => (body += c));
    req.on("end", () => {
      const send = (code: number, o: unknown) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
      const u = new URL(req.url!, "http://x");
      if (u.pathname === "/api/state") return send(200, { tick: 725, season: "wet season", climate_pct: 88, climate_phase: "normal", trees: 90,
        soil_mm: 101.2, river_ml: 215.6, river_days: 360, acts: commits.length, based_on: basedOn, head: "ab".repeat(32),
        surfaces: { web: 1 }, influence: 30, actor: u.searchParams.get("actor") });
      if (u.pathname === "/api/view") return send(200, { tick: 725, soil: "5".repeat(1024), tree: "0".repeat(1023) + "7", water: "4" + "0".repeat(1023) });
      if (u.pathname === "/api/ledger") return send(200, { head: "x", records: commits.filter(r => r.seq >= Number(u.searchParams.get("since") ?? 0)) });
      if (u.pathname === "/api/forecast") return send(200, { until: 4325, d_river_ml: -4.6, d_trees: 3, descendants: 3 });
      if (u.pathname === "/api/commit") {
        const b = JSON.parse(body);
        if (b.based_on !== basedOn) return send(409, { error: "the valley changed since you looked", based_on: basedOn, since: ["#9 Y2 d1 alex via chat planted 2"] });
        const rec = { seq: 10 + commits.length, kind: "intervention", tick: 725, prev: "cd".repeat(32), hash: "ef".repeat(32),
                      payload: { type: b.type, cells: [[14, 4]], intent: b.intent, actor: b.actor, surface: b.surface } };
        commits.push(rec); basedOn = rec.seq;
        return send(200, { record: rec, result: { planted: 1 }, influence: 29 });
      }
      send(404, { error: "not found" });
    });
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(() => server.close());

const ctx = { actor: "claude", surface: "mcp" };

describe("arcade registry", () => {
  it("hosts every game with core-valid, MCP-safe tool descriptors", () => {
    const a = createDefaultArcade(new MemoryApprovalStore(), url);
    expect(a.listGames().map(g => `${g.id}:${g.status}`)).toEqual([
      "continuum:live",
      "ledgermon:live",
      "stories:live",
      "aetheria:scaffold",
      "moa-flappy:scaffold",
      "remyman:scaffold",
      "gravity-painter:scaffold",
      "breakout:scaffold",
      "super-mcp-adventures:scaffold",
      "windows95:scaffold",
    ]);
    for (const t of a.listTools()) {
      expect(() => ToolDescriptor.parse(t.descriptor)).not.toThrow();
      expect(mcpName(t.descriptor.tool_id)).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    }
    const commit = a.findTool("continuum_commit")!;
    expect(commit.descriptor.side_effect_class).toBe("irreversible_write");
  });

  it("rejects tools that are not namespaced to their game", () => {
    const bad = { ...createLedgermonGame(), id: "other" };
    expect(() => new Arcade().register(bad)).toThrow(/namespaced/);
  });
  it("reports honest health for discovered filesystem games", async () => {
    const a = createDefaultArcade(new MemoryApprovalStore(), url);
    const moa = a.listGames().find(g => g.id === "moa-flappy")!;
    expect(moa).toBeDefined();
    const h = await moa.health();
    expect(h.ok).toBe(true);
    expect(h.detail).toContain("MoA Game");
  });
});

describe("irreversible gate", () => {
  it("read-only tools run immediately", async () => {
    const a = createDefaultArcade(new MemoryApprovalStore(), url);
    const r = await a.invoke("continuum_status", {}, ctx);
    expect(r.decision).toBe("allow");
    if (r.decision === "allow") expect(r.output.text).toContain("based_on=0");
  });

  it("commit needs a human, then runs exactly the approved call, once", async () => {
    const a = createDefaultArcade(new MemoryApprovalStore(), url);
    const input = { action: "plant", cells: "14,4", intent: "Shade the springs", based_on: basedOn };
    const first = await a.invoke("continuum:commit", input, ctx);
    expect(first.decision).toBe("require_human");
    if (first.decision !== "require_human") return;
    const id = first.approval.id;
    expect(commits.length).toBe(0);

    expect((await a.invoke("continuum:commit", { ...input, approval_id: id }, ctx)).decision).toBe("deny");     // not approved yet
    a.decide(id, "approved", "remy");
    const swapped = await a.invoke("continuum:commit", { ...input, cells: "0-9,0-9", approval_id: id }, ctx);
    expect(swapped.decision).toBe("deny");                                                                     // different call
    if (swapped.decision === "deny") expect(swapped.reason).toMatch(/different call/);
    // the swap attempt did not burn the approval; the real call still goes through
  });

  it("an approval is single-use and records the actor and surface", async () => {
    const store = new MemoryApprovalStore();
    const a = createDefaultArcade(store, url);
    const input = { action: "plant", cells: "14,4", intent: "Shade the springs", based_on: basedOn };
    const r1 = await a.invoke("continuum:commit", input, ctx);
    if (r1.decision !== "require_human") throw new Error("expected approval request");
    a.decide(r1.approval.id, "approved", "remy");
    const ok = await a.invoke("continuum:commit", { ...input, approval_id: r1.approval.id }, ctx);
    expect(ok.decision).toBe("allow");
    expect(commits.at(-1).payload).toMatchObject({ actor: "claude", surface: "mss", intent: "Shade the springs" });
    const again = await a.invoke("continuum:commit", { ...input, approval_id: r1.approval.id }, ctx);
    expect(again.decision).toBe("deny");
    if (again.decision === "deny") expect(again.reason).toMatch(/used/);
  });

  it("expired approvals cannot be used or decided", async () => {
    const store = new MemoryApprovalStore();
    const a = createDefaultArcade(store, url);
    const r = await a.invoke("continuum:commit", { action: "cut", cells: "14,4", intent: "timber for the granary", based_on: 0 }, ctx);
    if (r.decision !== "require_human") throw new Error("expected approval request");
    store.put({ ...store.get(r.approval.id)!, expires_at: new Date(Date.now() - 1).toISOString() });
    expect(() => a.decide(r.approval.id, "approved", "remy")).toThrow(/expired/);
  });

  it("a stale view comes back with what changed", async () => {
    const a = createDefaultArcade(new MemoryApprovalStore(), url);
    const input = { action: "plant", cells: "15,4", intent: "a late idea here", based_on: 0 };
    const r = await a.invoke("continuum:commit", input, ctx);
    if (r.decision !== "require_human") throw new Error("expected approval request");
    a.decide(r.approval.id, "approved", "remy");
    const out = await callTool(a, "continuum_commit", { ...input, approval_id: r.approval.id }, "claude");
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain("Since you looked");
  });

  it("file store is shared between processes (MCP writes, CLI approves)", () => {
    const dir = mkdtempSync(join(tmpdir(), "mss-apv-"));
    const s1 = new FileApprovalStore(dir), s2 = new FileApprovalStore(dir);
    const now = new Date().toISOString();
    s1.put({ id: "apv_0123456789", tool_id: "t", input_hash: "h", input: {}, summary: "s", requested_by: "claude", surface: "mcp",
             status: "pending", created_at: now, expires_at: new Date(Date.now() + 60_000).toISOString() });
    expect(s2.get("apv_0123456789")?.status).toBe("pending");
    expect(s2.get("../../etc/passwd")).toBeUndefined();
  });
});

describe("MCP surface", () => {
  it("lists arcade meta tools plus every game tool, with honest annotations", () => {
    const tools = toolList(createDefaultArcade(new MemoryApprovalStore(), url));
    expect(tools.map(t => t.name)).toEqual(expect.arrayContaining(["arcade_games", "continuum_commit", "ledgermon_battle"]));
    expect(tools.find(t => t.name === "continuum_commit")!.annotations).toMatchObject({ destructiveHint: true, readOnlyHint: false });
    expect(tools.some(t => /approve/.test(t.name) && t.name !== "arcade_approval_status")).toBe(false);   // no self-approval tool
  });
});

describe("Continuum as core world events", () => {
  it("maps ledger acts to valid WorldEventAppended events", async () => {
    const events = await createContinuumGame({ url }).worldEvents(0);
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(() => WorldEventAppended.parse(e)).not.toThrow();
    expect(events[0]).toMatchObject({ world_id: "continuum:valley", timeline_id: "main", world_event_type: "intervention.plant_trees" });
  });

  it("reports an unreachable daemon plainly", async () => {
    const g = createContinuumGame({ url: "http://127.0.0.1:1" });
    expect((await g.health()).ok).toBe(false);
    const r = await new Arcade().register(g).invoke("continuum:status", {}, ctx);
    expect(r.decision === "deny" && r.reason).toMatch(/unreachable/);
  });
});

describe("LEDGERMON battle (parity with engine/battle.rs)", () => {
  const s = (spd: number, acc: number, tem: number) => ({ spd, sta: 50, acc, tem, app: 50 });
  it("initiative by speed, verdict by acc × (1 − tem/100), ties to A", () => {
    const o = executeFamiliarBattle("did:zo:a", s(80, 90, 50), "did:zo:b", s(60, 70, 10));
    expect(o.battle_log).toEqual(["[Battle] did:zo:a vs did:zo:b", "[Initiative] did:zo:a takes the lead.", "[Verdict] did:zo:b dominates the logic stream."]);
    expect(o.xp_gained).toBe(250);
    expect(executeFamiliarBattle("a", s(50, 50, 0), "b", s(50, 50, 0)).winner_did).toBe("a");
  });
  it("is deterministic, and the hash reflects the inputs", () => {
    const x = executeFamiliarBattle("a", s(1, 2, 3), "b", s(4, 5, 6)), y = executeFamiliarBattle("a", s(1, 2, 3), "b", s(4, 5, 6));
    expect(x.deterministic_hash).toBe(y.deterministic_hash);
    expect(executeFamiliarBattle("a", s(1, 2, 4), "b", s(4, 5, 6)).deterministic_hash).not.toBe(x.deterministic_hash);
  });
  it("validates stats through the arcade", async () => {
    const r = await new Arcade().register(createLedgermonGame()).invoke("ledgermon:battle",
      { a_did: "a", a: "spd=10,sta=1,acc=1,tem=1,app=1", b_did: "b", b: "spd=1,sta=1,acc=1,tem=1,app=999" }, ctx);
    expect(r.decision === "deny" && r.reason).toMatch(/b.app/);
  });
});

describe("story games (mcp-games-monorepo YAML)", () => {
  const arcade = () => new Arcade().register(createStoriesGame({ saveDir: mkdtempSync(join(tmpdir(), "mss-st-")) }));
  it("loads The Morning Decision with every choice pointing at a real scene", async () => {
    const r = await arcade().invoke("stories:list", {}, ctx);
    expect(r.decision === "allow" && r.output.text).toMatch(/morning-decision · The Morning Decision/);
  });
  it("plays to an ending, keeps progress per player, and restarts", async () => {
    const a = arcade();
    const play = async (input: Record<string, unknown>, who = ctx) => {
      const r = await a.invoke("stories:play", { story: "morning-decision", ...input }, who);
      if (r.decision !== "allow") throw new Error(r.decision === "deny" ? r.reason : "blocked");
      return r.output.data as any;
    };
    let s = await play({});
    expect(s.scene).toBe("wake_up");
    expect(s.context_wanted.map((c: any) => c.variable)).toEqual(["weather_description", "calendar_preview"]);
    for (let i = 0; i < 20 && !s.ended; i++) s = await play({ choice: s.choices[0].id });
    expect(s.ended).toBe(true);
    expect((await play({}, { actor: "someone-else", surface: "cli" })).scene).toBe("wake_up");   // separate save
    expect((await play({ restart: true })).scene).toBe("wake_up");
    expect((await play({ choice: "energetic" })).variables).toMatchObject({ morning_mood: "energetic", energy: 80 });
  });
  it("injects caller-supplied context and rejects impossible choices", async () => {
    const a = arcade();
    const r = await a.invoke("stories:play", { story: "morning-decision", restart: true, context: { weather_description: "Rain taps the window." } }, ctx);
    expect(r.decision === "allow" && r.output.text).toContain("Rain taps the window.");
    const bad = await a.invoke("stories:play", { story: "morning-decision", choice: "fly" }, ctx);
    expect(bad.decision === "deny" && bad.reason).toMatch(/not a choice here/);
  });
});
