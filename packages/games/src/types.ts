/**
 * @mss/games — types.
 *
 * Anti-drift: a game module introduces no new core primitive. It is a named bundle of
 * `ToolDescriptor`s (@mss/core/resources/tool) plus handlers, and it reports world history
 * as `WorldEventAppended` events (@mss/core/events/world).
 */
import type { ToolDescriptor } from "@mss/core/resources/tool";

export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

export interface InvokeContext {
  /** Who is acting. Recorded by games that keep history (Continuum puts it in the ledger). */
  actor: string;
  /** Which surface the call came through (mcp, cli, http). */
  surface: string;
}

export interface GameTool {
  /** Core descriptor. `side_effect_class` drives gating: irreversible_write always needs a human. */
  descriptor: ToolDescriptor & { name: string; description: string };
  inputSchema: JsonSchema;
  handler: (input: Record<string, unknown>, ctx: InvokeContext) => Promise<ToolOutput>;
}

export interface ToolOutput {
  /** Plain text for humans and models. */
  text: string;
  /** Structured result for programs. */
  data?: unknown;
}

export interface GameHealth {
  ok: boolean;
  detail: string;
}

export interface GameModule {
  id: string;
  name: string;
  description: string;
  /** live: playable now. scaffold: registered so it shows up, no tools yet. */
  status: "live" | "scaffold";
  tools: GameTool[];
  health(): Promise<GameHealth>;
}

export class GameError extends Error {
  constructor(message: string, readonly code: number = 400, readonly detail?: unknown) {
    super(message);
  }
}
