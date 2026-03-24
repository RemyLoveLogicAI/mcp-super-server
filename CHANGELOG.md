# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-03-24

### Added — Phase 4: Security Hardening

#### HTTP Security Layer
- Bearer token authentication via `MCP_API_SECRET` environment variable
- CORS origin whitelisting via `MCP_ALLOWED_ORIGINS`
- Per-IP rate limiting (default: 100 req/min) with `X-RateLimit-*` headers
- Request body size limits (`MCP_MAX_BODY_SIZE`, default 1MB)
- Content-Type validation for POST requests
- Security headers: CSP, X-Frame-Options, X-XSS-Protection, X-Content-Type-Options
- HSTS header when authentication enabled

#### Session Management
- Session TTL with automatic cleanup (`MCP_SESSION_TTL_MS`, default 30 min)
- Max sessions per user enforcement (`MCP_MAX_SESSIONS_PER_USER`, default 5)
- Last activity tracking per session
- Graceful shutdown handlers (SIGTERM, SIGINT, uncaughtException, unhandledRejection)

#### Error Handling
- Structured error codes (UNAUTHORIZED, NOT_FOUND, RATE_LIMITED, etc.)
- Request ID tracking for debugging
- Generic error messages to clients, detailed errors logged server-side

#### Monitoring & Operations
- Health check system with automated 5-minute monitoring
- Load testing script with concurrent request simulation
- Security audit report with verification commands
- Production deployment checklist

#### Documentation
- Updated DEPLOYMENT.md with security configuration
- Updated RUNBOOK.md with incident response procedures
- Updated SECURITY_AUDIT.md with resolved findings

### Security Findings Resolved

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 3 | ✅ Resolved |
| HIGH | 4 | ✅ Resolved |
| MEDIUM | 5 | 🔄 3 resolved, 2 deferred |
| LOW | 3 | 🔄 2 resolved, 1 deferred |

### Environment Variables (New)

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_API_SECRET` | - | Bearer token for API authentication |
| `MCP_ALLOWED_ORIGINS` | - | Comma-separated CORS origins |
| `MCP_RATE_LIMIT` | 100 | Requests per minute per IP |
| `MCP_MAX_BODY_SIZE` | 1048576 | Max request body size (bytes) |
| `MCP_SESSION_TTL_MS` | 1800000 | Session TTL (30 min) |
| `MCP_MAX_SESSIONS_PER_USER` | 5 | Max concurrent sessions |

---

## [0.1.0] - 2026-03-24

### Added

#### Core Architecture
- `@mss/core`: Contract definitions, event types, Zod schemas, and policy interfaces
- `@mss/voice`: Voice session FSM with interrupt semantics (barge-in)
- `@mss/tools`: Policy tool gate with trust tier enforcement
- `@mss/ledger`: In-memory event ledger with hash chain integrity
- `@mss/identity`: Cross-platform identity mesh (OAuth/token linking)
- `@mss/orchestrator`: Agent execution planning and step management
- `@mss/context-fabric`: Multimodal context normalization

#### Vertical Slice
- `@mss/server`: Composed server with voice session + tool gate + ledger integration
- CLI runner for end-to-end testing
- Session management (create, retrieve, replay)
- Voice turn processing (AUDIO_START → ASR_FINAL → TTS)
- Tool invocation with policy gates (permissive, read-only, write-approval)
- Barge-in interrupt handling (cancels pending tools)

#### Testing
- 17 integration tests covering voice FSM, tool gates, and server vertical slice
- Vitest configuration for TypeScript

#### Whitepaper Compliance
- VoiceTurnStarted/VoiceTurnFinalized events (§5 Pillar 1)
- ToolCallRequested/Completed/Canceled events (§5 Pillar 2)
- Event sourcing with hash chain integrity (§4.2.8)
- Trust tier enforcement (§7.1)
- Side effect classification (read_only, reversible_write, irreversible_write)
- Human-in-the-loop gates (§7.4)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Super-Server                         │
├─────────────────────────────────────────────────────────────┤
│  @mss/voice     │ Voice FSM + Interrupt Semantics        │
│  @mss/tools     │ Policy Gate + Trust Enforcement         │
│  @mss/ledger    │ Event Store + Hash Chain               │
│  @mss/identity  │ Platform Identity Mesh                  │
│  @mss/orchestrator │ Agent Execution Planning             │
└─────────────────────────────────────────────────────────────┘
```

### Next Steps

- Implement `@mss/gateway` channel adapters
- Add `@mss/worlds` game runtime
- Implement `@mss/mesh` capability routing
- Add `@mss/context-fabric` query/streaming
- Supabase backend for `@mss/ledger`
