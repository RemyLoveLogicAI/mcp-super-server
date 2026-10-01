# Repository Guidelines

## Project Overview

- Private pnpm monorepo: `mcp-super-server`.
- Package manager: `pnpm@9.15.0`; workspaces: `apps/*`, `packages/*`; 18 workspace projects.
- Purpose: unified architecture for voice-native agentic systems, cross-platform worlds, and multi-agent orchestration.
- Contract-first source of truth: `packages/core` / `@mss/core`.
- Contract-First Rule:
  - No implementation is allowed to introduce new primitives not represented in `packages/core`.
  - If it's not in `@mss/core`, it's not real.
- Flagship proof: `apps/aetheria` validates `Identity -> Orchestrator -> Arcade -> Ledger` plus world-event fork/merge/rehydrate.

## Architecture & Data Flow

- `@mss/core`: canonical events, resources, contracts, policies, IDs, and schemas.
- `@mss/worlds`:
  - `WorldState`: `applyEvent`, `replayEvents`, `rehydrate`; rejects duplicate event IDs.
  - `TimelineManager`: `createTimeline`, `forkTimeline`, `mergeTimeline`; LCA traversal, fork bounds checks, and event-ID deduplication.
- `@mss/orchestrator`: plan/execute workflow, budgets, `ToolExecutor`, DAG validation, self-dependency and cycle detection.
- `@mss/identity`: `IdentityResolver`, `InMemoryIdentityStore`, Zod validation; supports web/Discord/Telegram/WhatsApp/Slack and other platforms.
- `@mss/games`: gated `Arcade` registry; tool IDs use `<game>:<verb>` such as `continuum:status` and `ledgermon:battle`.
- `@mss/ledger`: async append/replay, in-memory SHA-256 hash chain, and Supabase persistence path.
- `@mss/voice`: FSM states `idle`, `listening`, `processing`, `speaking`, `interrupted`; barge-in emits pending-tool cancellation effects; ASR/TTS include mock, Whisper, and ElevenLabs providers.
- `apps/server`: `MCPSuperServer` composition layer for identity, ledger, orchestrator, gates, sessions, and `RealToolExecutor`.
- `apps/aetheria/src/index.ts`:
  - Resolve `web/aetheria-demo-user`.
  - Plan `continuum:status` plus `ledgermon:battle`.
  - Convert battle outcome to `familiar_battled` `WorldEvent`.
  - Fork a counterfactual timeline, verify distinct projections, merge with `mergeTimeline`, rehydrate fresh state, and append ledger events.
- Primary flows:
  - `apps/aetheria/src/index.ts`: Identity -> Orchestrator -> Arcade -> Ledger.
  - `packages/worlds/src/timeline.ts` + `world.ts`: world-event fork/merge/rehydrate.
  - `apps/server/src/server.ts`: dependency-injection composition.
  - `packages/voice/src/fsm.ts`: voice events -> FSM effects.

## Key Directories

- `apps/server/` — MCP server composition, HTTP, CLI, health, and metrics.
- `apps/aetheria/` — flagship composition and branching-world proof.
- `apps/dashboard/` — observability UI.
- `packages/core/` — source-of-truth contracts and protocol types.
- `packages/worlds/` — event-sourced world state and timelines.
- `packages/orchestrator/` — plans, execution, budgets, and handoffs.
- `packages/identity/` — canonical identity resolution and linking.
- `packages/ledger/` — append-only ledger backends.
- `packages/games/` — Arcade, Continuum, LEDGERMON, stories, CLI, and MCP adapters.
- `packages/voice/` — voice transport FSM and providers.
- `packages/tools/`, `mesh/`, `gateway/`, `context-fabric/`, `vigil/`, `voice-command/`, `approval-gate/`, `engine/` — supporting capabilities.
- `.loki/specs/` — PRD and Aetheria increment specifications.
- `.loki/CONTINUITY.md` — working memory.
- `docs/whitepaper.md` — architecture source of truth; also see `docs/patent-draft.md` and package READMEs.

## Development Commands

- `pnpm install`
- `pnpm build` — `turbo build`; builds `^build` dependencies; outputs `dist/**`.
- `pnpm typecheck` — `turbo typecheck`.
- `pnpm lint` — `turbo lint`.
- `pnpm test` — `vitest run --config vitest.config.ts`.
- `pnpm --filter @mss/<name> build`
- `pnpm --filter @mss/<name> typecheck`
- `pnpm --filter @mss/aetheria dev` — `tsx src/index.ts`.
- `pnpm exec tsx apps/aetheria/src/index.ts` — Aetheria smoke path; requires live Continuum for `continuum:status`.
- `packages/games/bin/mss games|tools|call|approvals|mcp`
- `packages/games/bin/mss continuum status`
- `CONTINUUM_BIN=continuum packages/games/scripts/e2e-continuum.sh`
- Health checks:
  - `scripts/health_check.ts` — tests 10 subsystems.
  - `scripts/health_check.sh` — shell wrapper with build check.
  - `./scripts/health_check.sh --verbose`
  - Exit `0`: healthy; exit `1`: one or more checks failed.

## Code Conventions & Common Patterns

- TypeScript: ES2022/ESNext/Bundler, strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, ESM (`"type": "module"`).
- Use `@mss/<capability>` imports; Vitest aliases resolve them to `packages/*/src`.
- Prefer factories named `createX`: `createIdentityResolver`, `createDefaultArcade`, `createOrchestrator`, `createInMemoryLedger`.
- Use PascalCase classes: `WorldState`, `TimelineManager`, `Arcade`, `InMemoryLedger`.
- Tool IDs use `game:verb`; plans use `plan_id`, `step_id`, and `tool_id`.
- Ledger events use `event_id`; `@mss/worlds` `WorldEvent` uses `id`.
- Preserve async boundaries: `resolve`, `createPlan`, `executePlan`, `invoke`, and `append` are async.
- Prefer `ToolExecutionResult`/`InvokeResult` failures (`ok`, `allow`, `require_human`, `deny`) at runtime boundaries.
- Use exceptions for invalid DAGs, duplicate events, invalid fork/merge ancestry, and invalid stats.
- Map errors at boundaries: `GameError -> deny`, fetch failures -> `GameError`, Arcade decisions -> orchestrator results.
- Do not use `any`; preserve strict types and existing contracts.

## Important Files

- `package.json` — root scripts, pnpm version, and dependencies.
- `pnpm-workspace.yaml` — workspace globs.
- `turbo.json` — build/typecheck/lint/test task graph; `dev` has no cache.
- `vitest.config.ts` — test discovery, aliases, timeouts, and V8 coverage.
- `packages/core/src/` — canonical events/resources/contracts/policies/IDs/schemas.
- `packages/worlds/src/world.ts` — event-sourced `WorldState`.
- `packages/worlds/src/timeline.ts` — timeline creation, forking, LCA merge, and heads.
- `packages/orchestrator/src/orchestrator.ts` — plan validation and execution.
- `packages/games/src/arcade.ts` — tool registry and approval gates.
- `packages/ledger/src/memory.ts` — development/test ledger and SHA-256 chain.
- `packages/voice/src/fsm.ts` — voice state transitions and cancellation effects.
- `apps/server/src/server.ts` — server dependency composition.
- `apps/aetheria/src/index.ts` — end-to-end Aetheria proof.
- `.loki/specs/PRD.md`, `.loki/specs/PRD-2-aetheria-increment-1.md`, `.loki/specs/PRD-3-aetheria-increment-2.md` — specifications.
- `docs/whitepaper.md` — source of truth for architecture; `docs/patent-draft.md` — patent context.

## Runtime/Tooling Preferences

- Use pnpm as the canonical package manager and task runner; run TypeScript directly with `pnpm exec tsx`.
- Bun is used only by the documented health-check path (`bun run scripts/health_check.ts` / `./scripts/health_check.sh`); do not generalize it.
- Environment:
  - `CONTINUUM_URL` defaults to `http://127.0.0.1:7777`.
  - Actor variables: `MSS_ACTOR`, `CONTINUUM_ACTOR`.
  - `MSS_HOME` defaults to `~/.mss`.
  - Server configuration uses `MCP_*` variables.
- Ports:
  - `3000` — Arcade HTTP.
  - `7777` — Continuum daemon.
- Continuum is localhost-only; live `continuum:status` is not a unit-test dependency.
- Turbo tasks: `build`, `typecheck`, `lint`, `test`; `dev` is uncached.

## Testing & QA

- Framework: Vitest `^4.1.1`; globals enabled; Node environment.
- Test discovery: `packages/**/tests/**/*.test.ts` and `apps/**/tests/**/*.test.ts`.
- Exclude `node_modules` and `dist`; test and hook timeouts are 10 seconds.
- V8 coverage includes `packages/**/src/**/*.ts` and `apps/**/src/**/*.ts`; excludes `index.ts` and `.d.ts`; no numeric threshold is configured.
- Test directories include:
  - `packages/ledger/tests/`, `worlds/tests/`, `orchestrator/tests/`, `identity/tests/`, `games/tests/`, `voice/tests/`, `tools/tests/`, `voice-command/tests/`, `approval-gate/tests/`.
  - `apps/aetheria/tests/` and `apps/server/tests/`.
- Aetheria tests:
  - `apps/aetheria/tests/branching.test.ts` — fork, distinct projections, merge, rehydrate, battle, and ledger.
  - `apps/aetheria/tests/executor.test.ts` — Arcade allow/deny/approval mapping.
- Fixtures: `createInMemoryLedger`, `MemoryApprovalStore`, and `InMemoryIdentityStore`.
- Unit tests never touch the live daemon; use deterministic in-memory fixtures. Live Continuum belongs only in the `tsx` smoke path or E2E script.
- QA commands:
  - `pnpm test`
  - `pnpm exec vitest run --config vitest.config.ts apps/aetheria/tests`
  - `pnpm exec vitest run --config vitest.config.ts packages/games apps/server`
  - `pnpm exec vitest run --config vitest.config.ts --coverage`
  - `pnpm --filter @mss/aetheria typecheck`
  - `pnpm --filter @mss/worlds typecheck`
  - `pnpm typecheck`
