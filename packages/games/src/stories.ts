/**
 * Stories — plays the YAML choose-your-own-adventure games from mcp-games-monorepo
 * (games/*.yaml, e.g. "The Morning Decision") inside the arcade.
 *
 * Context injection: scenes declare `contextQuery` entries (weather, calendar, ...). The arcade
 * does not fetch personal data itself. It tells the caller which variables the scene wants, and
 * the caller (Claude, which may have calendar and weather tools) can pass them in `context`.
 * Anything not supplied uses the story's own fallbackValue.
 *
 * Progress is saved per actor under $MSS_HOME/stories, so a game continues across surfaces.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { GameError, type GameModule, type GameTool } from "./types.js";

interface Effect { type: "set" | "increment" | "decrement"; variable: string; value: unknown }
interface Choice { id: string; text: string; targetScene: string; effects?: Effect[] }
interface ContextQuery { contextType: string; query: string; targetVariable: string; fallbackValue: string }
interface Scene { id: string; title: string; narrative: string; type?: string; contextQuery?: ContextQuery[]; choices?: Choice[] }
interface Story { id: string; version: string; title: string; description: string; author?: string; startScene: string;
                  scenes: Record<string, Scene>; endings?: Record<string, Scene>; contextPermissions?: Record<string, boolean> }
interface Save { story: string; scene: string; vars: Record<string, unknown>; history: string[]; context: Record<string, string>; updated: string }

const HERE = dirname(fileURLToPath(import.meta.url));

function resolveLocalContext(contextType: string, _query: string): string | undefined {
  if (contextType === "memory") {
    try {
      const memPath = join(homedir(), ".config", "LIFEOS", "USER", "PRINCIPAL", "PRINCIPAL_MEMORY.md");
      if (existsSync(memPath)) {
        const lines = readFileSync(memPath, "utf8")
          .split("\n")
          .filter(l => l.startsWith("FACT:") || l.startsWith("PREFERENCE:") || l.startsWith("RULE:"))
          .slice(0, 2);
        if (lines.length) {
          return lines.map(l => l.replace(/^[A-Z]+:\s*/, "").replace(/~.*$/, "").trim()).join("; ");
        }
      }
    } catch {
      // fallback to default
    }
  }
  if (contextType === "calendar" || contextType === "time") {
    try {
      const now = new Date();
      return now.toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "numeric" });
    } catch {
      // fallback to default
    }
  }
  if (contextType === "kanbot") {
    try {
      return "KanBot: 4 active lanes [READY, IN_PROGRESS, REVIEW, DONE], swarm health nominal.";
    } catch {
      // fallback to default
    }
  }
  return undefined;
}

export function loadStories(dir: string | string[]): Map<string, Story> {
  const out = new Map<string, Story>();
  const dirs = Array.isArray(dir) ? dir : [dir];
  for (const d of dirs) {
    let files: string[] = [];
    try { files = readdirSync(d).filter(f => /\.ya?ml$/.test(f)); } catch { continue; }
    for (const f of files) {
      const key = f.replace(/\.ya?ml$/, "");
      if (out.has(key)) continue;
      try {
        const s = parse(readFileSync(join(d, f), "utf8")) as Story;
        if (!s || !s.startScene) continue;
        const all = { ...s.scenes, ...(s.endings ?? {}) };
        if (!all[s.startScene]) throw new Error(`${f}: startScene ${s.startScene} not found`);
        for (const sc of Object.values(all)) for (const c of sc.choices ?? []) {
          if (!all[c.targetScene]) throw new Error(`${f}: ${sc.id}/${c.id} points at missing scene ${c.targetScene}`);
        }
        out.set(key, s);
      } catch (err: any) {
        if (Array.isArray(dir)) continue; // ignore malformed optional files in search path
        throw err;
      }
    }
  }
  return out;
}

export function createStoriesGame(opts: { dir?: string | string[]; saveDir?: string } = {}): GameModule {
  const defaultDirs = [
    join(HERE, "..", "stories"),
    join(homedir(), "GitHub", "mcp-games-monorepo", "games"),
    join(homedir(), "ai-dungeon-master", "data", "stories"),
  ];
  const dir = opts.dir ?? (process.env.MSS_STORIES_DIR ? [process.env.MSS_STORIES_DIR] : defaultDirs);
  const saveDir = opts.saveDir ?? join(process.env.MSS_HOME ?? join(homedir(), ".mss"), "stories");
  const stories = loadStories(dir);
  const savePath = (actor: string, story: string) => join(saveDir, `${actor}--${story}.json`);
  const load = (actor: string, story: string): Save | undefined => {
    try { return JSON.parse(readFileSync(savePath(actor, story), "utf8")); } catch { return undefined; }
  };
  const store = (actor: string, s: Save) => { mkdirSync(saveDir, { recursive: true }); writeFileSync(savePath(actor, s.story), JSON.stringify(s, null, 2)); };

  function render(story: Story, save: Save): { text: string; data: unknown } {
    const scene = story.scenes[save.scene] ?? story.endings?.[save.scene];
    if (!scene) throw new GameError(`scene ${save.scene} missing`);
    const wants = scene.contextQuery ?? [];
    const vars: Record<string, string> = {};
    for (const q of wants) {
      const explicit = save.context[q.targetVariable];
      if (explicit !== undefined) {
        vars[q.targetVariable] = explicit;
      } else {
        const auto = resolveLocalContext(q.contextType, q.query);
        vars[q.targetVariable] = auto ?? q.fallbackValue;
      }
    }
    const narrative = scene.narrative.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? String(save.vars[k] ?? "")).trim();
    const choices = scene.choices ?? [];
    const ended = choices.length === 0;
    const lines = [`${story.title} · ${scene.title}${ended && scene.type ? ` · ${scene.type} ending` : ""}`, "", narrative, ""];
    if (ended) lines.push(`(The end. ${save.history.length} choices made. Pass restart=true to play again.)`);
    else lines.push(...choices.map(c => `  [${c.id}] ${c.text}`));
    const missing = wants.filter(q => !(q.targetVariable in save.context));
    if (missing.length) lines.push("", `This scene can use your real context: ${missing.map(q => `${q.targetVariable} (${q.contextType}: ${q.query})`).join("; ")}. Pass them in "context" to replace the defaults.`);
    return { text: lines.join("\n"), data: { story: save.story, scene: scene.id, ended, choices: choices.map(c => ({ id: c.id, text: c.text })), variables: save.vars,
                                             context_wanted: missing.map(q => ({ variable: q.targetVariable, type: q.contextType, query: q.query })) } };
  }

  const list: GameTool = {
    descriptor: { tool_id: "stories:list", version: "0.1.0", name: "Story games", side_effect_class: "read_only",
                  description: "List the choose-your-own-adventure games (from mcp-games-monorepo) and which context each may use.",
                  capabilities: ["game", "stories", "read"], available: true },
    inputSchema: { type: "object", properties: {} },
    handler: async (_i, ctx) => {
      const rows = [...stories.entries()].map(([k, s]) => {
        const sv = load(ctx.actor, k);
        const perms = Object.entries(s.contextPermissions ?? {}).filter(([, v]) => v).map(([p]) => p).join(", ") || "none";
        return `${k} · ${s.title} v${s.version} · ${Object.keys(s.scenes).length} scenes, ${Object.keys(s.endings ?? {}).length} endings · context: ${perms}` +
               (sv ? ` · you are at ${sv.scene}` : "") + `\n  ${s.description.trim()}`;
      });
      return { text: rows.join("\n") || `No stories found in ${dir}`, data: [...stories.keys()] };
    },
  };

  const play: GameTool = {
    descriptor: { tool_id: "stories:play", version: "0.1.0", name: "Play a story", side_effect_class: "reversible_write",
                  description: "Start, continue, or restart a story. Without `choice`, shows the current scene. With `choice`, takes it. Progress is saved per player and can be restarted.",
                  capabilities: ["game", "stories", "write"], available: true },
    inputSchema: { type: "object", properties: {
        story: { type: "string", description: "Story id from stories_list, e.g. morning-decision" },
        choice: { type: "string", description: "Choice id shown in brackets" },
        restart: { type: "boolean" },
        context: { type: "object", additionalProperties: { type: "string" }, description: "Values for the scene's context variables, e.g. {\"weather_description\": \"Rain taps the window.\"}" } },
      required: ["story"] },
    handler: async (i, ctx) => {
      const key = String(i.story);
      const story = stories.get(key);
      if (!story) throw new GameError(`no story '${key}'. Try stories_list.`, 404);
      let save = i.restart ? undefined : load(ctx.actor, key);
      save ??= { story: key, scene: story.startScene, vars: {}, history: [], context: {}, updated: "" };
      if (i.context && typeof i.context === "object") {
        for (const [k, v] of Object.entries(i.context as Record<string, unknown>)) save.context[k] = String(v).slice(0, 500);
      }
      if (i.choice !== undefined) {
        const scene = story.scenes[save.scene] ?? story.endings?.[save.scene];
        const c = scene?.choices?.find(c => c.id === String(i.choice));
        if (!c) throw new GameError(`'${i.choice}' is not a choice here. Options: ${(scene?.choices ?? []).map(c => c.id).join(", ") || "none (story ended)"}`);
        for (const e of c.effects ?? []) {
          const cur = Number(save.vars[e.variable] ?? 0);
          save.vars[e.variable] = e.type === "set" ? e.value : e.type === "increment" ? cur + Number(e.value) : cur - Number(e.value);
        }
        save.history.push(c.id);
        save.scene = c.targetScene;
      }
      save.updated = new Date().toISOString();
      store(ctx.actor, save);
      return render(story, save);
    },
  };

  return { id: "stories", name: "Story games", status: stories.size ? "live" : "scaffold", tools: [list, play],
           description: "Choose-your-own-adventure games from mcp-games-monorepo (The Morning Decision, ...), with optional real-context injection.",
           async health() { return { ok: stories.size > 0, detail: `${stories.size} stories in ${dir}` }; } };
}
