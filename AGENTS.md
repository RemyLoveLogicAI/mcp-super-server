# MCP Super-Server Memory

## Project Status (Updated 2026-03-24)

### Completed Phases

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Foundation (build, dependencies) | ✅ Complete |
| Phase 2 | Vertical Slice (sessions, voice, gates) | ✅ Complete |
| Phase 3 | Integration Tests | ✅ Complete (132 tests) |
| Phase 4 | Security Hardening | ✅ Complete |
| Phase 5 | Production Polish | 📋 Planned |

### Current Metrics

| Metric | Value |
|--------|-------|
| Packages | 13 |
| Test Files | 9 |
| Tests | 132 passed, 1 skipped |
| Security Findings Resolved | 10/15 |

### Security Controls

| Control | Status | Config Variable |
|---------|--------|-----------------|
| Bearer Auth | ✅ | `MCP_API_SECRET` |
| CORS Whitelist | ✅ | `MCP_ALLOWED_ORIGINS` |
| Rate Limiting | ✅ | `MCP_RATE_LIMIT` |
| Security Headers | ✅ | Built-in |
| Session TTL | ✅ | `MCP_SESSION_TTL_MS` |
| Input Validation | ✅ | `MCP_MAX_BODY_SIZE` |
| Graceful Shutdown | ✅ | Built-in |

### Live Endpoints

- **Health**: https://mcp-super-server-remysr.zocomputer.io/health
- **Status**: https://mcp-super-server-remysr.zocomputer.io/status
- **Dashboard**: https://remysr.zo.space/mcp-dashboard

---

### Build & Test Commands

```bash
pnpm build    # Build all 13 packages
pnpm test     # Run all tests (24 tests across 6 test files)
```

### Key Architecture

- **packages/core**: Events, resources, policies, contracts (source of truth)
- **packages/orchestrator**: Planning and execution with budgets and callbacks
- **packages/voice**: Voice FSM with barge-in support
- **packages/tools**: Tool gates (permissive, read_only, write_approval)
- **packages/ledger**: In-memory event store with replay
- **apps/server**: Composition layer wiring all components

### Test Counts

| Package | Tests |
|---------|-------|
| @mss/orchestrator | 10 |
| @mss/server | 4 |
| @mss/voice | 7 |
| @mss/worlds | 5 |
| @mss/tools | 3 |
| @mss/ledger | 2 (+ 1 skipped) |
| **Total** | **31** |

### Contract-First Rule

No implementation is allowed to introduce new primitives not represented in `packages/core`.
If it's not in `@mss/core`, it's not real.

## Health Check System (Added 2026-03-24)

### Scripts

| Script | Path | Purpose |
|--------|------|---------|
| TypeScript health check | `scripts/health_check.ts` | Comprehensive subsystem testing |
| Shell wrapper | `scripts/health_check.sh` | Executable wrapper with build check |

### Subsystems Tested

1. **Server Health** — Verifies `server.health()` returns healthy status with all checks enabled
2. **Server Status** — Validates version, environment, and session tracking
3. **Identity Resolution** — Tests identity linking and canonical user resolution
4. **Voice Session Creation** — Creates voice sessions with proper FSM initialization
5. **Voice FSM Transitions** — Tests AUDIO_START → ASR_FINAL state transitions (idle → listening → processing)
6. **Tool Registry Access** — Registers tools and validates descriptor handling
7. **Tool Gate Evaluation** — Tests policy gate evaluation for read/write permissions
8. **Ledger Write** — Appends events to the in-memory ledger
9. **Ledger Read/Replay** — Replays events from ledger to verify persistence
10. **Session Cleanup** — Verifies session termination and resource cleanup

### Automated Monitoring

- **Schedule**: Every 5 minutes (`FREQ=MINUTELY;INTERVAL=5`)
- **Agent ID**: `15990eee-2b6d-45d0-9f89-aa762f3f7a38`
- **Delivery**: Email alerts on failure only
- **Prerequisites**: Project built (`pnpm build`), bun available in PATH

### Manual Usage

```bash
# Run TypeScript health check directly
bun run scripts/health_check.ts

# Run with shell wrapper (includes build check)
./scripts/health_check.sh

# Run with verbose output
./scripts/health_check.sh --verbose
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All health checks passed (HEALTHY) |
| 1 | One or more health checks failed (UNHEALTHY) |