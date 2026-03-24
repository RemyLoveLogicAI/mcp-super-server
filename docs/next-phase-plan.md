# Next Phase Plan: Hardening + E2E + Publish

## Goals
- Harden `createPlan` and `executePlan` with validation, dependency handling, budget checks, and logging.
- Expand tests to cover orchestrator, context fabric, worlds, and server integration paths.
- Wire CLI and server for end-to-end execution.
- Publish developer-facing docs and diagrams.

## Architecture
- `packages/orchestrator`: planning and execution engine with budgets and per-step callbacks.
- `packages/context-fabric`: linked context store for voice, tool, identity, and world objects.
- `apps/server`: composition layer that wires voice FSM → gates → executor → ledger → context fabric.
- `apps/server/src/cli.ts`: runnable demo for local validation.

## Testing Strategy
1. Unit tests for orchestrator plan creation/execution.
2. Contract tests for context fabric and worlds state semantics.
3. Integration tests for server flows.
4. CLI smoke test for end-to-end demo.

## Delivery Checklist
- [x] Add structured logging hooks to orchestrator.
- [x] Make `createPlan` accept plan step metadata and validate budget/dependency constraints.
- [x] Ensure `executePlan` handles timeouts, failures, and dependency violations deterministically.
- [x] Add tests for empty goals, budget overflow, step failure, and dependency chains.
- [x] Keep CLI output stable for demos.
