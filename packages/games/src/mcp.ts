/**
 * Arcade MCP server (stdio, JSON-RPC 2.0, newline-delimited). One MCP entry for every game.
 *
 *   {"mcpServers": {"mss-arcade": {"command": "/path/to/mcp-super-server/packages/games/bin/mss", "args": ["mcp"],
 *     "env": {"CONTINUUM_URL": "http://127.0.0.1:7777", "MSS_ACTOR": "claude"}}}}
 *
 * Irreversible tools return an approval request instead of acting. Approving is only possible
 * from the `mss` CLI, so the model can ask but never approve its own permanent actions.
 */
import { createInterface } from "node:readline";
import { mcpName, type Arcade } from "./arcade.js";
import { refresh } from "./approvals.js";

const PROTOCOL = "2025-06-18";

export function toolList(arcade: Arcade) {
  const gameTools = arcade.listTools().map(t => ({
    name: mcpName(t.descriptor.tool_id),
    title: t.descriptor.name,
    description: t.descriptor.description,
    inputSchema: t.inputSchema,
    annotations: {
      title: t.descriptor.name,
      readOnlyHint: t.descriptor.side_effect_class === "read_only",
      destructiveHint: t.descriptor.side_effect_class === "irreversible_write",
      idempotentHint: t.descriptor.side_effect_class === "read_only",
      openWorldHint: false,
    },
  }));
  return [
    { name: "arcade_games", title: "Arcade games", description: "List every game on the super-server with its status, health, and tools.",
      inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
    { name: "arcade_approval_status", title: "Approval status", description: "Check whether a human has approved a pending irreversible action.",
      inputSchema: { type: "object", properties: { approval_id: { type: "string" } }, required: ["approval_id"] }, annotations: { readOnlyHint: true } },
    ...gameTools,
  ];
}

export async function callTool(arcade: Arcade, name: string, args: Record<string, unknown>, actor: string) {
  const text = (t: string, isError = false) => ({ content: [{ type: "text", text: t }], isError });
  if (name === "arcade_games") {
    const lines = await Promise.all(arcade.listGames().map(async g => {
      const h = await g.health();
      return `${g.name} (${g.id}) · ${g.status} · ${h.ok ? "ok" : "DOWN"}: ${h.detail}\n  ${g.description}\n  tools: ${g.tools.map(t => mcpName(t.descriptor.tool_id)).join(", ") || "none yet"}`;
    }));
    return text(lines.join("\n"));
  }
  if (name === "arcade_approval_status") {
    const a = arcade.approvals.get(String(args.approval_id));
    return a ? text(`${a.id}: ${refresh(a).status} · ${a.summary}`) : text(`no approval ${args.approval_id}`, true);
  }
  const r = await arcade.invoke(name, args, { actor, surface: "mcp" });
  if (r.decision === "allow") return text(r.output.text);
  if (r.decision === "require_human") return text(`APPROVAL NEEDED (${r.approval.id})\n${r.approval.summary}\n\n${r.prompt}`);
  const since = (r.detail as any)?.since as string[] | undefined;
  return text(`Refused: ${r.reason}${since?.length ? "\nSince you looked:\n" + since.join("\n") : ""}`, true);
}

export async function serveMcp(arcade: Arcade, actor: string): Promise<void> {
  const out = (o: unknown) => process.stdout.write(JSON.stringify(o) + "\n");
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let msg: any;
    try { msg = JSON.parse(line); } catch { out({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); continue; }
    const { id, method, params = {} } = msg;
    if (id === undefined || id === null) continue;                     // notifications
    try {
      let result: unknown;
      if (method === "initialize") {
        result = { protocolVersion: params.protocolVersion ?? PROTOCOL, capabilities: { tools: {} },
                   serverInfo: { name: "mss-arcade", title: "MCP Super-Server Arcade", version: "0.1.0" },
                   instructions: "Games on Remy's MCP super-server. Read-only tools run freely. Tools marked destructive are permanent: forecast first, confirm with the user, and expect to wait for a human to run `mss approve <id>`." };
      } else if (method === "ping") result = {};
      else if (method === "tools/list") result = { tools: toolList(arcade) };
      else if (method === "tools/call") result = await callTool(arcade, params.name, params.arguments ?? {}, actor);
      else { out({ jsonrpc: "2.0", id, error: { code: -32601, message: `unknown method ${method}` } }); continue; }
      out({ jsonrpc: "2.0", id, result });
    } catch (e) {
      out({ jsonrpc: "2.0", id, error: { code: -32603, message: (e as Error).message } });
    }
  }
}
