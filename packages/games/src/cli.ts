/**
 * mss — the super-server's command line for games.
 *
 *   mss games                                  every game, its status and health
 *   mss tools [game]                           tools and their side-effect class
 *   mss call <tool> [key=value ...] [--json '{...}'] [--yes]
 *   mss approvals | approve <id> | deny <id>   human decisions on permanent actions
 *   mss mcp                                    stdio MCP server (one entry for Claude)
 *
 *   mss continuum status | map | log [since] | why X Y
 *   mss continuum forecast plant|cut CELLS
 *   mss continuum plant|cut CELLS --why "reason" [--yes]
 *   mss ledgermon battle <didA> spd=..,sta=..,acc=..,tem=..,app=.. <didB> spd=..,...
 *
 * Env: CONTINUUM_URL (default http://127.0.0.1:7777), MSS_ACTOR (default $USER), MSS_HOME (default ~/.mss)
 */
import { createInterface } from "node:readline/promises";
import { userInfo } from "node:os";
import { FileApprovalStore, refresh } from "./approvals.js";
import { mcpName, type Arcade, type InvokeResult } from "./arcade.js";
import { createDefaultArcade } from "./index.js";
import { serveMcp } from "./mcp.js";

const C = process.stdout.isTTY ? { b: "\x1b[1m", d: "\x1b[2m", r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m", x: "\x1b[0m" }
                               : { b: "", d: "", r: "", g: "", y: "", x: "" };

function actorName(): string {
  const raw = process.env.MSS_ACTOR ?? process.env.CONTINUUM_ACTOR ?? userInfo().username ?? "guest";
  return raw.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 32) || "guest";
}

function parseArgs(argv: string[]) {
  const flags: Record<string, string | boolean> = {};
  const pos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--yes" || a === "-y") flags.yes = true;
    else if (a.startsWith("--")) flags[a.slice(2)] = argv[++i] ?? "";
    else pos.push(a);
  }
  return { flags, pos };
}

async function confirm(summary: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ans = await rl.question(`${C.y}${C.b}Permanent:${C.x} ${summary}\nType ${C.b}yes${C.x} to approve and commit: `);
  rl.close();
  return ans.trim().toLowerCase() === "yes";
}

/** Run a tool as the human at this terminal: they are the approver for their own permanent acts. */
async function run(arcade: Arcade, tool: string, input: Record<string, unknown>, yes: boolean, actor: string): Promise<number> {
  let r: InvokeResult = await arcade.invoke(tool, input, { actor, surface: "cli" });
  if (r.decision === "require_human") {
    const ok = yes || await confirm(r.approval.summary);
    if (!ok) {
      console.log(`${C.y}Not committed.${C.x} Approval request ${r.approval.id} is pending; approve later with: mss approve ${r.approval.id}`);
      return 5;
    }
    arcade.decide(r.approval.id, "approved", actor);
    r = await arcade.invoke(tool, { ...input, approval_id: r.approval.id }, { actor, surface: "cli" });
  }
  if (r.decision === "allow") { console.log(r.output.text); return 0; }
  if (r.decision === "deny") {
    console.log(`${C.r}Refused:${C.x} ${r.reason}`);
    for (const s of ((r.detail as any)?.since ?? []) as string[]) console.log(`  since you looked: ${s}`);
    return 4;
  }
  return 1;
}

function kv(pos: string[]): Record<string, unknown> {
  return Object.fromEntries(pos.map(p => {
    const i = p.indexOf("=");
    if (i < 0) throw new Error(`expected key=value, got '${p}'`);
    const v = p.slice(i + 1);
    return [p.slice(0, i), /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v];
  }));
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const actor = actorName();
  const arcade = createDefaultArcade(new FileApprovalStore());
  const { flags, pos } = parseArgs(argv);
  const [cmd, ...rest] = pos;
  const yes = flags.yes === true;

  switch (cmd) {
    case "mcp":
      await serveMcp(arcade, actor);
      return 0;
    case "games": {
      for (const g of arcade.listGames()) {
        const h = await g.health();
        console.log(`${C.b}${g.name}${C.x} ${C.d}(${g.id})${C.x}  ${g.status === "live" ? C.g + "live" : C.y + "scaffold"}${C.x}  ${h.ok ? C.g + "●" : C.r + "●"}${C.x} ${h.detail}`);
        console.log(`  ${g.description}`);
      }
      return 0;
    }
    case "tools": {
      for (const t of arcade.listTools().filter(t => !rest[0] || t.descriptor.tool_id.startsWith(rest[0] + ":"))) {
        const s = t.descriptor.side_effect_class;
        console.log(`${t.descriptor.tool_id.padEnd(22)} ${(s === "irreversible_write" ? C.r : s === "read_only" ? C.g : C.y) + s.padEnd(19) + C.x} mcp:${mcpName(t.descriptor.tool_id)}`);
      }
      return 0;
    }
    case "call": {
      const [tool, ...pairs] = rest;
      if (!tool) throw new Error("usage: mss call <tool> [key=value ...] [--json '{...}']");
      const input = flags.json ? JSON.parse(String(flags.json)) : kv(pairs);
      return run(arcade, tool, input, yes, actor);
    }
    case "approvals": {
      const list = arcade.approvals.list().map(a => refresh(a)).filter(a => flags.all || a.status === "pending");
      if (!list.length) console.log("No pending approvals.");
      for (const a of list) console.log(`${C.b}${a.id}${C.x} ${a.status} · requested by ${a.requested_by} via ${a.surface} · expires ${a.expires_at}\n  ${a.summary}`);
      return 0;
    }
    case "approve":
    case "deny": {
      const a = arcade.decide(String(rest[0]), cmd === "approve" ? "approved" : "denied", actor);
      console.log(`${a.id} ${a.status} by ${actor}. ${cmd === "approve" ? "The requester can now call the tool again with approval_id=" + a.id + "." : ""}`);
      return 0;
    }
    case "continuum": {
      const [verb, ...args] = rest;
      if (verb === "status" || verb === "map") return run(arcade, `continuum:${verb}`, {}, yes, actor);
      if (verb === "log") return run(arcade, "continuum:changes", { since: Number(args[0] ?? 0) }, yes, actor);
      if (verb === "why") return run(arcade, "continuum:why", { x: Number(args[0]), y: Number(args[1]) }, yes, actor);
      if (verb === "forecast") return run(arcade, "continuum:forecast", { action: args[0], cells: args.slice(1).join(" ") }, yes, actor);
      if (verb === "plant" || verb === "cut") {
        if (!flags.why) throw new Error(`usage: mss continuum ${verb} CELLS --why "reason"`);
        const st = await arcade.invoke("continuum:status", {}, { actor, surface: "cli" });
        if (st.decision !== "allow") return run(arcade, "continuum:status", {}, yes, actor);
        const based_on = flags["based-on"] !== undefined ? Number(flags["based-on"]) : (st.output.data as any).based_on;
        return run(arcade, "continuum:commit", { action: verb, cells: args.join(" "), intent: String(flags.why), based_on }, yes, actor);
      }
      throw new Error("usage: mss continuum status|map|log|why|forecast|plant|cut ...");
    }
    case "ledgermon": {
      const [verb, aDid, aStats, bDid, bStats] = rest;
      if (verb !== "battle" || !bStats) throw new Error("usage: mss ledgermon battle <didA> spd=..,sta=..,acc=..,tem=..,app=.. <didB> spd=..,...");
      return run(arcade, "ledgermon:battle", { a_did: aDid, a: aStats, b_did: bDid, b: bStats }, yes, actor);
    }
    default:
      console.log((await import("node:fs")).readFileSync(new URL(import.meta.url), "utf8").split("*/")[0]!.replace(/^\/\*\*|^ \* ?/gm, "").trim());
      return cmd ? 2 : 0;
  }
}

main().then(code => process.exit(code), e => { console.error(`${C.r}${(e as Error).message}${C.x}`); process.exit(2); });
