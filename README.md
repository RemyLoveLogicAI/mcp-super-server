# MCP Super-Server (Contract-First Monorepo)

> A unified architecture for voice-native agentic systems, cross-platform worlds, and multi-agent orchestration.

This repo is **contract-first by design**. The canonical architecture is defined in:

- `docs/whitepaper.md` — Source of Truth
- `docs/patent-draft.md` — Claim surfaces / novelty mapping

## Anti-Drift Rule

**No implementation is allowed to introduce new primitives not represented in `packages/core`.**

If it's not in `@mss/core`, it's not real.

## Architecture (Whitepaper §4.2)

| Package | Whitepaper Section | Description |
|---------|-------------------|-------------|
| `packages/core` | §4.2, §12 | Events, resources, policies, contracts |
| `packages/gateway` | §4.2.1 | Channel adapters + transport termination |
| `packages/voice` | §4.2.2 | Voice transport + interrupt semantics |
| `packages/context-fabric` | §4.2.3 | Unified state+memory substrate |
| `packages/orchestrator` | §4.2.4 | Agent planning + delegation + budgets |
| `packages/tools` | §4.2.5 | Capability registry + sandbox execution |
| `packages/worlds` | §4.2.6 | Ink/Glulx runtimes + entity simulation |
| `packages/identity` | §4.2.7 | Canonical identity resolution |
| `packages/ledger` | §4.2.8 | Append-only event store + replay/branch |
| `packages/mesh` | §4.2.9 | Capability routing + federation |

## Apps

| App | Purpose |
|-----|---------|
| `apps/server` | Main MCP super-server entry |
| `apps/aetheria` | Flagship demonstrator |
| `apps/dashboard` | Observability UI (Agentic Horizon) |

## Quick Start

```bash
pnpm install
pnpm build
pnpm typecheck
```

## Patent Surfaces (Four Core Innovations)

1. **Multimodal Agent Context Fabric** — Platform-level, policy-scoped, event-sourced context
2. **Voice-Native MCP Transport Layer** — Voice as transport with lifecycle guarantees
3. **Agentic Game State Orchestrator** — Multi-agent orchestrated world logic
4. **Cross-Platform Identity Mesh** — Native identity continuity across channels

## Documentation

| Document | Description |
|----------|-------------|
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Installation, service registration, and deployment procedures |
| [RUNBOOK.md](./RUNBOOK.md) | Operational procedures, troubleshooting, and incident response |
| [SECURITY.md](./docs/SECURITY.md) | Security audit, controls, and compliance considerations |
| [API.md](./API.md) | API endpoints and contracts |
| [docs/whitepaper.md](./docs/whitepaper.md) | Canonical architecture specification |
| [docs/patent-draft.md](./docs/patent-draft.md) | Claim surfaces and novelty mapping |
| [docs/mcp-architecture.png](./docs/mcp-architecture.png) | System architecture diagram |

## License

Proprietary. Patent pending.
