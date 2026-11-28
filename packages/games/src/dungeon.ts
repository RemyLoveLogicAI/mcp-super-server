/**
 * @mss/games — AI Dungeon Master module.
 * Exposes deterministic D20 rules, dice rolling, and tactical encounter simulations
 * from the local ai-dungeon-master repository as first-class Arcade tools.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { GameError, type GameModule, type GameTool } from "./types.js";

export function createDungeonGame(opts: { root?: string } = {}): GameModule {
  const root = opts.root ?? join(homedir(), "ai-dungeon-master");
  const venvPython = join(root, ".venv", "bin", "python");
  const pythonBin = existsSync(venvPython) ? venvPython : "python3";

  const rollTool: GameTool = {
    descriptor: {
      tool_id: "dungeon:roll",
      version: "0.1.0",
      name: "Roll D20",
      side_effect_class: "read_only",
      description: "Roll a D20 with optional advantage/disadvantage, modifier, and critical detection.",
      capabilities: ["game", "dungeon", "dice", "read"],
      available: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["Normal", "Advantage", "Disadvantage"],
          description: "Advantage mode (default Normal)",
        },
        modifier: {
          type: "number",
          description: "Attack or check modifier (default 0)",
        },
      },
    },
    handler: async (input) => {
      const mode = (input.mode as string) || "Normal";
      const modifier = Number(input.modifier ?? 0);
      const die1 = Math.floor(Math.random() * 20) + 1;
      const die2 = Math.floor(Math.random() * 20) + 1;
      let finalDie = die1;
      if (mode === "Advantage") finalDie = Math.max(die1, die2);
      if (mode === "Disadvantage") finalDie = Math.min(die1, die2);
      const total = finalDie + modifier;
      const isCrit = finalDie === 20;
      const isFumble = finalDie === 1;
      const tag = isCrit ? " [CRITICAL HIT!]" : isFumble ? " [NATURAL 1 - FUMBLE!]" : "";
      const text =
        mode === "Normal"
          ? `Rolled ${finalDie} + ${modifier} = ${total}${tag}`
          : `Rolled [${die1}, ${die2}] (${mode} -> ${finalDie}) + ${modifier} = ${total}${tag}`;

      return {
        text,
        data: {
          d20: finalDie,
          first_die: die1,
          second_die: die2,
          mode,
          modifier,
          total,
          isCrit,
          isFumble,
        },
      };
    },
  };

  const encounterTool: GameTool = {
    descriptor: {
      tool_id: "dungeon:encounter",
      version: "0.1.0",
      name: "Simulate Encounter",
      side_effect_class: "read_only",
      description: "Run a deterministic tactical combat simulation from the AI Dungeon Master engine.",
      capabilities: ["game", "dungeon", "combat", "read"],
      available: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        difficulty: {
          type: "string",
          enum: ["easy", "medium", "hard", "deadly"],
          description: "Encounter difficulty (default medium)",
        },
        seed: {
          type: "number",
          description: "Random seed for deterministic replay (default 42)",
        },
        rounds: {
          type: "number",
          description: "Maximum combat rounds (default 30)",
        },
      },
    },
    handler: async (input) => {
      const difficulty = (input.difficulty as string) || "medium";
      const seed = Number(input.seed ?? 42);
      const rounds = Number(input.rounds ?? 30);

      if (!existsSync(join(root, "combat_runner.py"))) {
        throw new GameError(`ai-dungeon-master combat_runner.py not found at ${root}`, 404);
      }

      try {
        const out = execFileSync(
          pythonBin,
          [
            "combat_runner.py",
            "generated",
            "--difficulty",
            difficulty,
            "--seed",
            String(seed),
            "--rounds",
            String(rounds),
          ],
          { cwd: root, encoding: "utf8", timeout: 12000 }
        );
        return { text: out.trim(), data: { difficulty, seed, rounds } };
      } catch (err: any) {
        throw new GameError(`failed to run dungeon combat encounter: ${err.message}`);
      }
    },
  };

  const isLive = existsSync(join(root, "d20_rules.py"));

  return {
    id: "dungeon",
    name: "AI Dungeon Master",
    status: isLive ? "live" : "scaffold",
    tools: [rollTool, encounterTool],
    description: "Tactical D20 rules engine, seeded procedural combat, and branching fantasy encounters.",
    async health() {
      const ok = existsSync(join(root, "d20_rules.py"));
      return {
        ok,
        detail: ok ? `tactical D20 engine live at ${root}` : `not found at ${root}`,
      };
    },
  };
}
