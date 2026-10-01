/**
 * The Arcade: one registry for every game the super-server hosts.
 *
 * Gating mirrors the server's write_approval mode:
 *   read_only          -> runs
 *   reversible_write   -> runs (games may add their own checks)
 *   irreversible_write -> first call returns an approval request; a human approves it from
 *                         the CLI; the second call must carry that approval_id and the exact
 *                         same input. Approvals are single-use and expire.
 */
import { APPROVAL_TTL_MS, type Approval, type ApprovalStore, inputHash, MemoryApprovalStore, newApprovalId, refresh } from "./approvals.js";
import { GameError, type GameModule, type GameTool, type InvokeContext, type ToolOutput } from "./types.js";

export type InvokeResult =
  | { decision: "allow"; tool_id: string; output: ToolOutput }
  | { decision: "require_human"; tool_id: string; approval: Approval; prompt: string }
  | { decision: "deny"; tool_id: string; reason: string; detail?: unknown };

/** MCP tool names must match ^[a-zA-Z0-9_-]{1,64}$ ; core tool ids use "game:verb". */
export const mcpName = (toolId: string) => toolId.replace(/[^a-zA-Z0-9_-]/g, "_");

export class Arcade {
  private games = new Map<string, GameModule>();
  private tools = new Map<string, { game: GameModule; tool: GameTool }>();

  constructor(readonly approvals: ApprovalStore = new MemoryApprovalStore()) {}

  register(game: GameModule): this {
    if (this.games.has(game.id)) throw new Error(`game ${game.id} already registered`);
    for (const t of game.tools) {
      const id = t.descriptor.tool_id;
      if (!id.startsWith(game.id + ":")) throw new Error(`tool ${id} must be namespaced as ${game.id}:<verb>`);
      if (this.tools.has(id)) throw new Error(`duplicate tool ${id}`);
      if ([...this.tools.keys()].some(k => mcpName(k) === mcpName(id))) throw new Error(`tool ${id} collides after MCP renaming`);
      this.tools.set(id, { game, tool: t });
    }
    this.games.set(game.id, game);
    return this;
  }

  listGames(): GameModule[] { return [...this.games.values()]; }
  listTools(): GameTool[] { return [...this.tools.values()].map(v => v.tool); }
  findTool(idOrMcpName: string): GameTool | undefined {
    return this.tools.get(idOrMcpName)?.tool ?? this.listTools().find(t => mcpName(t.descriptor.tool_id) === idOrMcpName);
  }

  async invoke(toolId: string, input: Record<string, unknown>, ctx: InvokeContext): Promise<InvokeResult> {
    const tool = this.findTool(toolId);
    if (!tool) return { decision: "deny", tool_id: toolId, reason: `unknown tool ${toolId}` };
    const id = tool.descriptor.tool_id;
    const { approval_id, ...args } = input as { approval_id?: string } & Record<string, unknown>;

    if (tool.descriptor.side_effect_class === "irreversible_write") {
      if (!approval_id) {
        const now = Date.now();
        const a: Approval = {
          id: newApprovalId(), tool_id: id, input_hash: inputHash(id, args), input: args,
          summary: summarize(id, args), requested_by: ctx.actor, surface: ctx.surface, status: "pending",
          created_at: new Date(now).toISOString(), expires_at: new Date(now + APPROVAL_TTL_MS).toISOString(),
        };
        this.approvals.put(a);
        return {
          decision: "require_human", tool_id: id, approval: a,
          prompt: `This is permanent. A human must approve it in a terminal:\n  mss approve ${a.id}\n` +
                  `then call ${mcpName(id)} again with the same arguments plus approval_id="${a.id}". Expires in 15 minutes.`,
        };
      }
      const stored = this.approvals.get(String(approval_id));
      if (!stored) return { decision: "deny", tool_id: id, reason: `no approval ${approval_id}` };
      const a = refresh(stored);
      if (a.status !== "approved") {
        return { decision: "deny", tool_id: id, reason: `approval ${a.id} is ${a.status}${a.status === "pending" ? " (a human has not approved it yet)" : ""}` };
      }
      if (a.tool_id !== id || a.input_hash !== inputHash(id, args)) {
        return { decision: "deny", tool_id: id, reason: `approval ${a.id} was granted for a different call; request a new one` };
      }
      this.approvals.put({ ...a, status: "used" });               // single use, even if the game then refuses
    }

    try {
      return { decision: "allow", tool_id: id, output: await tool.handler(args, ctx) };
    } catch (e) {
      if (e instanceof GameError) return { decision: "deny", tool_id: id, reason: e.message, detail: e.detail };
      return { decision: "deny", tool_id: id, reason: `tool failed: ${(e as Error).message}` };
    }
  }

  /** Human decisions. Deliberately not exposed as MCP tools. */
  decide(id: string, decision: "approved" | "denied", by: string): Approval {
    const stored = this.approvals.get(id);
    if (!stored) throw new GameError(`no approval ${id}`, 404);
    const a = refresh(stored);
    if (a.status !== "pending") throw new GameError(`approval ${id} is already ${a.status}`, 409);
    const out = { ...a, status: decision, decided_by: by, decided_at: new Date().toISOString() };
    this.approvals.put(out);
    return out;
  }

  pending(): Approval[] {
    return this.approvals.list().map(a => refresh(a)).filter(a => a.status === "pending");
  }
}

function summarize(toolId: string, args: Record<string, unknown>): string {
  const bits = Object.entries(args).map(([k, v]) => `${k}=${typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v)}`);
  return `${toolId}(${bits.join(", ")})`.slice(0, 300);
}
