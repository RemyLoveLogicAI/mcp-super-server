# @mss/games — the Arcade

Every game on the MCP super-server, behind one gate, on three surfaces: the `mss` CLI, one MCP
entry for Claude, and the super-server's HTTP API (`GET /games`, `POST /tool/invoke`).

**Whitepaper mapping:** §4.2.5 Tool Manager + §4.2.6 World Runtime Manager (Innovation #3).
**Anti-drift:** no new core primitive. A game is a bundle of `ToolDescriptor`s
(`@mss/core/resources/tool`) with handlers, and world history is reported as
`WorldEventAppended` (`@mss/core/events/world`).

| Game | Status | Tools | Notes |
|---|---|---|---|
| Continuum | live | `status` `map` `changes` `forecast` `why` · `commit` (irreversible) | Client of the Continuum daemon; the daemon stays the single writer |
| LEDGERMON | live | `battle` | TS port of `packages/engine/src/battle.rs`; real input hash instead of the Rust mock hash |
| Story games | live | `list` · `play` (reversible) | Plays mcp-games-monorepo YAML adventures (`stories/`, e.g. The Morning Decision). Scenes ask for context; the caller supplies it or the story's fallback is used |
| Aetheria | scaffold | none yet | Listed so it shows up everywhere |

## The gate

| `side_effect_class` | What happens |
|---|---|
| `read_only` | runs |
| `reversible_write` | runs |
| `irreversible_write` | returns an approval request. A human runs `mss approve <id>`; the caller repeats the exact same call with `approval_id`. Approvals are bound to the tool and a hash of the input, single-use, and expire after 15 minutes. |

There is no approve tool on the MCP surface, so a model can request a permanent act but never
approve its own. Approvals live in `$MSS_HOME/approvals` (default `~/.mss/approvals`) so the MCP
process and your terminal share them.

## Use it

```bash
pnpm install
packages/games/bin/mss games                 # every game, status, health
packages/games/bin/mss tools continuum
packages/games/bin/mss continuum status
packages/games/bin/mss continuum forecast plant 14-16,4
packages/games/bin/mss continuum plant 14-16,4 --why "Shade the headwaters springs"   # asks you to type yes
packages/games/bin/mss call stories:play story=morning-decision choice=slow
packages/games/bin/mss approvals             # what Claude is waiting on
packages/games/bin/mss approve apv_xxxxxxxxxx
packages/games/bin/mss ledgermon battle did:zo:remy-main spd=80,sta=50,acc=90,tem=20,app=40 did:zo:remy-r1 spd=60,sta=50,acc=70,tem=10,app=30
```

Symlink `bin/mss` onto your PATH to drop the prefix.

Claude Desktop / Claude Code:

```json
{"mcpServers": {"mss-arcade": {
  "command": "/Users/lovelogic/GitHub/mcp-super-server/packages/games/bin/mss", "args": ["mcp"],
  "env": {"CONTINUUM_URL": "http://127.0.0.1:7777", "MSS_ACTOR": "claude"}}}}
```

## Add a game

Write a `GameModule` (`src/types.ts`) whose tool ids are `<game>:<verb>`, give each tool an honest
`side_effect_class`, and register it in `createDefaultArcade` (`src/index.ts`). It then appears in
the CLI, MCP, and HTTP surfaces with no other changes.

## Tests

```bash
npx vitest run --config vitest.config.ts packages/games apps/server   # 20 unit/integration tests
CONTINUUM_BIN=continuum packages/games/scripts/e2e-continuum.sh      # 13 end-to-end checks against a real daemon
```

## Operating the Continuum daemon

`mss continuum ...` and the arcade's `continuum:*` tools are a client of a separate
Continuum daemon (`python -m continuum serve`) — the daemon is the single writer for the
world, so every surface (this CLI, MCP, the web shell) sees the same history. On macOS
it runs as a persistent LaunchAgent, `ai.lovelogic.continuum`, world at
`~/.continuum/worlds/valley`, port 7777.

```bash
packages/games/scripts/continuum-daemon.sh install     # load, RunAtLoad + KeepAlive
packages/games/scripts/continuum-daemon.sh status      # loaded? + a live /api/state probe
packages/games/scripts/continuum-daemon.sh uninstall   # unload
```

`KeepAlive` restarts the daemon if it crashes; the world's event-sourced ledger survives
restarts (verify with `continuum verify --world ~/.continuum/worlds/valley`). Logs land
in `~/.continuum/daemon.log` / `daemon.err.log`. This daemon binds `127.0.0.1` only —
Continuum has no auth yet, so it must never be exposed beyond localhost.

