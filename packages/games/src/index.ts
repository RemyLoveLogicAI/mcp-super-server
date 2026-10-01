/**
 * @mss/games — the super-server's arcade.
 * Every game is a bundle of core ToolDescriptors + handlers behind one gate.
 */
export * from "./types.js";
export * from "./approvals.js";
export * from "./arcade.js";
export { createContinuumGame } from "./continuum.js";
export type { ContinuumOptions } from "./continuum.js";
export { createLedgermonGame, createAetheriaGame, executeFamiliarBattle } from "./ledgermon.js";
export { createStoriesGame, loadStories } from "./stories.js";
export {
  createMoaFlappyGame,
  createRemyManGame,
  createGravityPainterGame,
  createBreakoutGame,
  createSuperMcpAdventuresGame,
  createWindows95Game,
} from "./discovered.js";
export {
  ArcadeToolExecutor,
  conductPlan,
  formatConductResult,
  type ConductStepInput,
  type ConductOptions,
} from "./conduct.js";

import { type ApprovalStore } from "./approvals.js";
import { Arcade } from "./arcade.js";
import { createContinuumGame } from "./continuum.js";
import { createAetheriaGame, createLedgermonGame } from "./ledgermon.js";
import { createStoriesGame } from "./stories.js";
import {
  createMoaFlappyGame,
  createRemyManGame,
  createGravityPainterGame,
  createBreakoutGame,
  createSuperMcpAdventuresGame,
  createWindows95Game,
} from "./discovered.js";

/** The default lineup. Add a game here and it appears in the CLI, MCP, and HTTP surfaces. */
export function createDefaultArcade(approvals?: ApprovalStore, continuumUrl?: string): Arcade {
  return new Arcade(approvals)
    .register(createContinuumGame(continuumUrl ? { url: continuumUrl } : {}))
    .register(createLedgermonGame())
    .register(createStoriesGame())
    .register(createAetheriaGame())
    .register(createMoaFlappyGame())
    .register(createRemyManGame())
    .register(createGravityPainterGame())
    .register(createBreakoutGame())
    .register(createSuperMcpAdventuresGame())
    .register(createWindows95Game());
}
