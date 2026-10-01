/**
 * @mss/games — Discovered standalone and visual games across the filesystem,
 * registered as GameModules in the Arcade.
 */
import { existsSync } from "node:fs";
import { type GameModule } from "./types.js";

export function createMoaFlappyGame(): GameModule {
  const root = "/Users/lovelogic/Documents/MoA Game";
  return {
    id: "moa-flappy",
    name: "MoA 3D Flappy Bird",
    status: "scaffold",
    tools: [],
    description: "3D Flappy Bird built with Three.js, React 19, and Cloudflare Workers with leaderboard API (/api/scores).",
    async health() {
      const exists = existsSync(`${root}/app/page.tsx`);
      return { ok: exists, detail: exists ? "standalone Three.js web app at Documents/MoA Game" : "not found on disk" };
    },
  };
}

export function createRemyManGame(): GameModule {
  const root = "/Users/lovelogic/GitHub/RemyMan";
  return {
    id: "remyman",
    name: "Kilo Man",
    status: "scaffold",
    tools: [],
    description: "2.5D side-scrolling platformer with procedural physics, monsters, and parallax depth in Next.js 15 / React 19.",
    async health() {
      const exists = existsSync(`${root}/app/components/Game/GameCanvas.tsx`);
      return { ok: exists, detail: exists ? "Next.js 15 canvas game at GitHub/RemyMan" : "not found on disk" };
    },
  };
}

export function createGravityPainterGame(): GameModule {
  const root = "/Users/lovelogic/GitHub/project1AI";
  return {
    id: "gravity-painter",
    name: "Gravity Painter",
    status: "scaffold",
    tools: [],
    description: "Interactive gravity particle painter game on HTML5 Canvas where attraction wells steer motion.",
    async health() {
      const exists = existsSync(`${root}/game.js`);
      return { ok: exists, detail: exists ? "HTML5 canvas physics game at GitHub/project1AI" : "not found on disk" };
    },
  };
}

export function createBreakoutGame(): GameModule {
  const root = "/Users/lovelogic/GitHub/github-breakout";
  return {
    id: "breakout",
    name: "GitHub Breakout",
    status: "scaffold",
    tools: [],
    description: "GitHub contribution graph Breakout game generator (simulates paddle/ball physics, emits animated SVG).",
    async health() {
      const exists = existsSync(`${root}/src/svg.ts`);
      return { ok: exists, detail: exists ? "TypeScript SVG simulation generator at GitHub/github-breakout" : "not found on disk" };
    },
  };
}

export function createSuperMcpAdventuresGame(): GameModule {
  const root = "/Users/lovelogic/GitHub/super-mcp/src/games";
  return {
    id: "super-mcp-adventures",
    name: "Super-MCP Interactive Fiction",
    status: "scaffold",
    tools: [],
    description: "Parser-based interactive fiction suite: Zork, Colossal Cave Adventure, and D&D dungeon crawler (3,591 LOC).",
    async health() {
      const exists = existsSync(`${root}/zork/game.py`);
      return { ok: exists, detail: exists ? "Zork, Adventure, D&D engines (3,591 LOC) at GitHub/super-mcp" : "not found on disk" };
    },
  };
}

export function createWindows95Game(): GameModule {
  const root = "/Users/lovelogic/GitHub/windows95";
  return {
    id: "windows95",
    name: "Windows 95 Classic Games",
    status: "scaffold",
    tools: [],
    description: "Classic Windows 95 gaming environment (Solitaire, Minesweeper, Hearts, FreeCell) in Electron x86 emulation.",
    async health() {
      const exists = existsSync(`${root}/package.json`);
      return { ok: exists, detail: exists ? "Electron v86 x86 emulation at GitHub/windows95" : "not found on disk" };
    },
  };
}
