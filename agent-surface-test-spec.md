# Agent Surface Test — Specification

**Status:** Draft (approved via interview 2026-09-30 — implementation not started)
**Request:** *"I'd like my agent surface test ran"* — clarified as: **create** an automated API surface test suite for the MCP Super-Server's exposed HTTP surface, **then run it**.
**Repo:** `/Users/lovelogic/GitHub/mcp-super-server` (pnpm monorepo, TypeScript ESM, Vitest 4, turbo)

---

## 1. Background

The repo's HTTP entry point `apps/server/src/http.ts` exposes the agent service's API surface:

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/health` | GET | public | Load-balancer health probe |
| `/metrics` | GET | public | Prometheus text metrics |
| `/status` | GET | bearer | Server status (`version`, `environment`, `activeSessions`) |
| `/games` | GET | bearer | Arcade game registry + per-game health + tool list |
| `/` | GET | bearer | Service descriptor (`name`, `version`, `endpoints[]`) |
| `/voice/session` | POST | bearer + JSON | Identity resolution + voice session creation |
| `/tool/invoke` | POST | bearer + JSON | Gated tool invocation (arcade or registered tools) |
| `OPTIONS` | any | public | CORS preflight → 204 |

Security controls documented in `SECURITY_AUDIT.md` (all "resolved"): C-001 bearer auth (`MCP_API_SECRET`, timing-safe compare), C-002 CORS whitelist (`MCP_ALLOWED_ORIGINS`), C-003 per-IP rate limiting (`MCP_RATE_LIMIT`, default 100/min, `X-RateLimit-*` headers, 429), H-001 input validation (`MCP_MAX_BODY_SIZE` default 1MB, JSON content-type, parse errors), H-002 security headers (`nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection`, `CSP default-src 'self'`, HSTS when auth on), H-003 sanitized errors (structured `{ error, code, requestId }` bodies), H-004 session TTL/eviction (server-side, not HTTP-visible).

Today these controls are verified only by **manual curl commands** in `SECURITY_AUDIT.md` ("Security Testing Commands") against the deployed host. This request replaces that with an automated, local, deterministic suite.

**Request-handling order in `http.ts` (drives every expected status below):**
security headers → CORS headers → rate-limit check → `OPTIONS` 204 → public `/health` `/metrics` → auth gate (401) → `GET /status` `/games` `/` → POST content-type check (415) → body size check (413) → JSON parse (400) → route validation (400) → fallback 404. Unknown paths/methods → 404.

---

## 2. Confirmed decisions (from interview)

| # | Decision | Choice | Notes |
|---|---|---|---|
| 1 | Meaning of "agent surface test" | **API surface tests** — exposed HTTP endpoints of the agent service | User picked from options |
| 2 | Deliverable | **Create it, then run it** — spec defines the suite; execution is the follow-up step | This spec = step 1 |
| 3 | Project location | `/Users/lovelogic/GitHub/mcp-super-server` | User answered "idk"; located via repo artifacts (`tmp/branch_paths.txt` → monorepo path match) |
| 4 | Test target | **Local HTTP server** — real `http.ts` booted locally | Not the deployed `zocomputer.io` host, not class-only |
| 5 | Scope | **All four areas**: happy-path routes + auth matrix + abuse/validation matrix + headers/CORS | |
| 6 | Form | **Vitest suite + thin Bun wrapper script** | |
| 7 | Testability strategy | **Child processes** — spawn `http.ts` via tsx with per-scenario env; **no refactor of `http.ts`** | |
| 8 | Rate limiting | **Low limit via env** — dedicated process with `MCP_RATE_LIMIT=2` | Fast + deterministic |
| 9 | Tool fixtures | **Real arcade tools** — `ledgermon:battle` (deterministic allow) + real irreversible tool for `require_human` | Matches `arcade.test.ts` style |
| 10 | Behavior stance | **Pin current behavior** — assert exactly what the server does today; oddities listed as *findings*, not fixed | No `http.ts` code changes |
| 11 | Arcade composition | **Ledgermon-only in spirit**: exercise only daemon-free tools; the spawned server still attaches the default arcade (unavoidable without source changes — see §6.3) | |
| 12 | Wrapper runtime | **Bun** (`scripts/surface_check.ts`), matching `health_check.ts` / `load-test.ts` convention | |
| 13 | Wiring | **Root pnpm script** `test:surface`; no turbo task changes | |
| 14 | Output format | **Defaulted to "Vitest output + findings report"** (user left unanswered twice; implied by decision #10's "oddities get listed as findings") | See §8 |

---

## 3. Deliverables

```
apps/server/tests/http-surface.test.ts   # the suite (new)
scripts/surface_check.ts                 # Bun wrapper (new)
package.json                             # + "test:surface" root script (edit)
```

1. **`apps/server/tests/http-surface.test.ts`** — Vitest suite (auto-discovered by the existing glob `apps/**/tests/**/*.test.ts`, so `pnpm test` picks it up too). Uses only global `fetch` and `node:child_process` — **no new dependencies** (repo has no supertest; keep it that way).
2. **`scripts/surface_check.ts`** — Bun wrapper following `scripts/health_check.ts` conventions: optional pre-flight `dist` check/build, then shells out to the vitest command below, streams output, exits with vitest's code.
   ```bash
   pnpm exec vitest run --config vitest.config.ts apps/server/tests/http-surface.test.ts
   ```
3. **Root `package.json`** — add script mirroring existing conventions:
   ```json
   "test:surface": "vitest run --config vitest.config.ts apps/server/tests/http-surface.test.ts"
   ```

---

## 4. Suite architecture (child processes)

### 4.1 Server scenarios

The suite spawns **three** `http.ts` child processes in `beforeAll` (per describe block, sharing one `beforeAll` via a small `spawnServer(env)` helper):

| Scenario | Purpose | Env overrides |
|---|---|---|
| **auth-on** | Happy paths + auth matrix + headers/CORS-whitelist + validation (415/413/400) | `PORT=<random high>`, `MCP_API_SECRET=surface-test-secret`, `MCP_ALLOWED_ORIGINS=https://app.example.com`, `MCP_RATE_LIMIT=1000` (high, so it never interferes), `MSS_HOME=<tmpdir>/auth-on` |
| **dev-mode** | Auth-off behavior + wildcard CORS + HSTS absence | `PORT=<random high>`, `MCP_API_SECRET` unset, `MCP_ALLOWED_ORIGINS` unset, `MCP_RATE_LIMIT=1000`, `MSS_HOME=<tmpdir>/dev` |
| **abuse-limits** | Rate limiting (429) only | `PORT=<random high>`, `MCP_API_SECRET=surface-test-secret`, `MCP_RATE_LIMIT=2`, `MCP_MAX_BODY_SIZE=64`, `MSS_HOME=<tmpdir>/abuse` |

- **Spawn command:** `pnpm exec tsx apps/server/src/http.ts`, `cwd` = repo root, scenario env merged over `process.env`.
- **Ports:** random in a high range (e.g., 30000–39000) per process, retried on collision; never 3000 (Arcade) or 7777 (Continuum). *Do not* use `PORT=0` — the bound port is only discoverable via the ASCII banner, which is fragile to parse.
- **Readiness:** poll `GET /health` every 200ms until HTTP 200 or ~8s (fits `hookTimeout: 10000`). Fail the hook with captured stderr on timeout.
- **Cleanup (`afterAll`):** `SIGTERM` → await exit ≤2s → `SIGKILL` fallback. Delete `MSS_HOME` tmpdirs.
- **Body-size test placement:** 413 is asserted in **auth-on** using a >1MB body (default `MCP_MAX_BODY_SIZE` 1048576) — sending ~1.1MB of JSON is cheap and avoids a fourth process. (The small `MCP_MAX_BODY_SIZE=64` on abuse-limits exists only to keep that process's budget tiny; if simpler, 413 may move to abuse-limits instead — implementer's choice, spec treats them as equivalent.)

### 4.2 Build prerequisite (important)

`apps/server` resolves workspace deps (`@mss/games`, …) through `node_modules` → each package's `main` → **`dist/`** (e.g., `@mss/games` → `./dist/index.js`). Vitest aliases bypass this for in-test imports, but **spawned processes do not**. Therefore:

- The suite (or the Bun wrapper) must verify `packages/*/dist` exists; if missing, run `pnpm build` first (or fail with a clear "run pnpm build" message). Wrapper runs the build check; the bare vitest entry documents the prerequisite in its failure output.

### 4.3 No-daemon guarantee (how "Ledgermon-only" is honored)

The spawned `http.ts` hardcodes `attachArcade(createDefaultArcade(new FileApprovalStore()))` — 10 games (Continuum, Ledgermon, Stories, Aetheria, 6 discovered mini-games). Without touching `http.ts` we cannot swap this, so decision #11 is honored by **exercising only daemon-free tools**:

- **`ledgermon:battle`** — deterministic, no external calls (proven by `arcade.test.ts` running it in-process with no daemon).
- **`continuum:commit`** — `side_effect_class: "irreversible_write"`; `arcade.invoke` returns `require_human` + approval **before ever calling the handler** (`packages/games/src/arcade.ts:53`), so the Continuum daemon is never contacted. Also safe: its `health()` catches fetch errors → `/games` reports `ok: false`, no hang.
- All other continuum/story/aetheria tools are simply never invoked.
- `MSS_HOME` is redirected per scenario so `FileApprovalStore` writes (`~/.mss/approvals` default) never pollute the real home dir.

---

## 5. Test matrix (pinned expectations)

All assertions pin **current** behavior. Exact bodies/headers per code as of this spec.

### 5.1 Happy-path routes (auth-on)

| Test | Request | Pinned expectation |
|---|---|---|
| Health | `GET /health` (no token) | 200; `{ status:"healthy", checks:{ledger:true,identity:true,orchestrator:true,contextFabric:true}, version:"0.0.1" }`; has `timestamp` (ISO string) |
| Metrics | `GET /metrics` (no token) | 200; `content-type: text/plain; charset=utf-8`; Prometheus-style text (e.g., contains `mss_` prefixed metric names / `http_requests_total`) |
| Status | `GET /status` + Bearer | 200; `{ version:"0.0.1", environment:"development", activeSessions:<number> }` |
| Root | `GET /` + Bearer | 200; `{ name:"mcp-super-server", version:"0.0.1", endpoints:[...all 6...], documentation:"MCP Super-Server HTTP API" }` |
| Games list | `GET /games` + Bearer | 200; `{ games:[...] }` — array non-empty; includes Continuum (health `ok:false` when daemon down — pin + finding) and Ledgermon (`ok:true`); each entry has `id,name,status,description,health,tools[]` with `tool_id` + `side_effect_class` |
| Preflight | `OPTIONS /tool/invoke` | 204; `Access-Control-Allow-Methods` includes `GET, POST, OPTIONS`; `Access-Control-Allow-Headers` includes `Content-Type, Authorization` |
| Unknown route | `GET /definitely-not-here` | 404; body `{ error:"Not found", code:"NOT_FOUND" }` + `requestId` (8-byte hex) |

### 5.2 Voice sessions (auth-on)

| Test | Request | Pinned expectation |
|---|---|---|
| Create session | `POST /voice/session` `{ platform:"web", platformId:"surface-test-<runId>" }` | 200; `{ sessionId:<UUID>, state:"idle" }` |
| Missing field | same, `{ platform:"web" }` (no `platformId`) | 400 `{ code:"BAD_REQUEST" }` |
| Status reflects it | `GET /status` after creation | `activeSessions` increased by 1 |

### 5.3 Tool invocation (auth-on) — real arcade tools

| Test | Request | Pinned expectation |
|---|---|---|
| Read-only game tool allow | `POST /tool/invoke` `toolId:"ledgermon:battle"`, inputs from `arcade.test.ts` (`a_did:"did:zo:remy-main"`, stats `{spd:80,sta:50,acc:90,tem:20,app:40}` vs `b_did:"did:zo:remy-r1"` `{spd:60,sta:50,acc:70,tem:10,app:30}`) | 200; `{ decision:"allow", result:{ ... winner_did:"did:zo:remy-main" ... } }` |
| Irreversible → approval | `POST /tool/invoke` `toolId:"continuum:commit"` (valid-shaped input, no `approval_id`) | 200; `{ decision:"require_human", prompt:<string containing "mss approve">, approval_id: /^apv_/ }` |
| Bad approval id | repeat with `approval_id:"apv_nonexistent"` | 200; `{ decision:"deny", reason:<mentions approval> }` |
| Unknown tool | `POST /tool/invoke` `toolId:"nope:nope"` | Pin actual: expected **`require_human`** (non-arcade path fabricates an `irreversible_write` descriptor on the fly → write-approval gate). **Finding F-1** |
| Missing toolId | `POST /tool/invoke` `{ sessionId:"x" }` | 400 `{ code:"BAD_REQUEST" }` |

### 5.4 Auth matrix (auth-on + dev-mode)

| Test | Pinned expectation (auth-on) |
|---|---|
| No token → `/status`, `/games`, `/`, `/voice/session`, `/tool/invoke` | 401; `{ code:"UNAUTHORIZED" }`; `requestId` present |
| Wrong token (`Bearer wrong-secret`), non-Bearer scheme (`Basic abc`), empty Bearer | 401 each |
| Public bypass | `/health` and `/metrics` → 200 **without** token |
| Correct token | All protected routes → 200 |
| HSTS present | `Strict-Transport-Security: max-age=31536000; includeSubDomains` on responses (auth enabled) |

| Test | Pinned expectation (dev-mode) |
|---|---|
| No secret configured | `/status`, `/games`, `/`, `/voice/session`, `/tool/invoke` all reachable **without** Authorization (auth disabled) |
| HSTS absent | No `Strict-Transport-Security` header |
| Wildcard CORS | Request with `Origin: https://evil.example` → `Access-Control-Allow-Origin: *` (dev mode); server logs `[SECURITY] CORS` warning (stderr capture optional) |

### 5.5 Abuse / validation matrix (auth-on for validation; abuse-limits for 429)

| Test | Pinned expectation |
|---|---|
| Wrong content-type | `POST /tool/invoke` with `content-type: text/plain` + Bearer → 415 `{ code:"INVALID_CONTENT_TYPE" }` |
| Missing content-type | POST with no `content-type` header → 415 |
| Oversized body | POST ~1.1MB JSON + correct CT → 413 `{ code:"PAYLOAD_TOO_LARGE" }` |
| Malformed JSON | POST `{not json` + `application/json` → 400 `{ code:"BAD_REQUEST" }` |
| Wrong method | `GET /tool/invoke` → 404 `NOT_FOUND` (not 405) — **Finding F-2** |
| Rate-limit headers | Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (epoch ms) |
| 429 trip (abuse-limits, limit=2) | 1st request 200 (remaining=1) → 2nd 200 (remaining=0) → 3rd 429 `{ code:"RATE_LIMITED" }`, still has `X-RateLimit-*` headers + `requestId` |
| 429 on any route | Confirmed via `/health` (cheapest) — rate limit applies before public-route handling |

### 5.6 Headers / CORS (auth-on)

| Test | Pinned expectation |
|---|---|
| Security headers on ALL responses (200, 401, 404, 415, 429) | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Content-Security-Policy: default-src 'self'` |
| Whitelisted CORS | Request `Origin: https://app.example.com` → `Access-Control-Allow-Origin: https://app.example.com` (echoed) + `Access-Control-Allow-Credentials: true` |
| Non-whitelisted CORS | `Origin: https://evil.example` → **no** `Access-Control-Allow-Origin` header at all |
| Error bodies never leak internals | 401/404/429 bodies contain only `error`, `code`, `requestId` keys |

---

## 6. Initial findings list (expected oddities to surface, not fix)

The suite maintains a module-level `findings: string[]` populated as tests observe oddities; a final non-failing `it("reports surface findings")` prints them via `console.warn` as a numbered list (the "findings report"). Expected at spec time:

- **F-1** Unknown `toolId` via `/tool/invoke` returns `require_human` (fabricated `irreversible_write` descriptor) instead of a not-found/deny error — an unauthenticated client (with a stolen token) gets approval-prompt-shaped output for nonexistent tools.
- **F-2** Wrong HTTP method returns 404 `NOT_FOUND` rather than 405 `Method Not Allowed` (e.g., `GET /tool/invoke`).
- **F-3** `/health` reports `uptime: 0` hardcoded (`server.ts` `health()`).
- **F-4** Root `/` exposes `version` even with auth enabled — `SECURITY_AUDIT.md` L-001 claims "version hidden on root endpoint when auth enabled," but the code does not implement that.
- **F-5** `/games`, `/`, and both POST routes are not instrumented in `http_requests_total` metrics (only `/health`, `/metrics`, `/status` are).
- **F-6** `/games` with Continuum daemon down reports that game `ok:false` (correct) — noted as intentional current behavior, verify stays non-throwing.
- **F-7** Default arcade exposes 10 games to any authenticated caller with no per-game access control (informational).

Findings are additive — implementers should append any additional oddities discovered while pinning.

---

## 7. Constraints & non-goals

- **No source-code changes** to `apps/server/src/**`, `packages/**` — pin-only suite. Findings are reported, never patched (a follow-up request can address them).
- **No new dependencies.** Global `fetch` + `node:child_process` only.
- **No external services:** no Continuum daemon, no Supabase, no network egress beyond `127.0.0.1`.
- **No pollution:** `MSS_HOME` redirected to temp dirs; nothing written to `~/.mss`; no fixed ports 3000/7777 touched.
- **Out of scope:** testing the deployed `zocomputer.io` host; load testing (`scripts/load-test.ts` covers that); CLI/MCP adapter surfaces (only HTTP); turbo task or CI pipeline changes.
- **Timeouts:** respect repo `testTimeout`/`hookTimeout` of 10s; suite should complete well under that budget per test (server boot ≤8s, requests fast).
- Conventions: strict TypeScript, no `any` (AGENTS.md), factories pattern, Vitest globals are enabled (`globals: true`) but existing tests import explicitly — follow `arcade.test.ts` style with explicit `describe/it/expect` imports.

---

## 8. Run procedure (the "then run it" step)

After implementation approval:

```bash
# Option A (recommended): wrapper handles build check
bun scripts/surface_check.ts

# Option B: direct
pnpm test:surface
```

Expected output: Vitest run of `apps/server/tests/http-surface.test.ts` — all pins green, followed by the findings report listing §6 items (plus anything newly observed). Exit code 0 = surface matches pinned behavior. A pin failure = **regression or drift** in the HTTP surface (that is the suite's purpose); a finding = oddity to triage separately.

---

## 9. Acceptance criteria

1. `bun scripts/surface_check.ts` and `pnpm test:surface` both execute the suite; exit 0 on a clean repo.
2. Every table row in §5 is represented by at least one assertion (exact status codes, `code` strings, and header values as pinned).
3. Three child processes are spawned, polled ready, and terminated cleanly (no orphaned node processes after the run; tmp `MSS_HOME` dirs removed).
4. Suite passes with the Continuum daemon **not running**.
5. Findings report prints at minimum F-1..F-6 without failing the suite.
6. `pnpm test` (full suite) still passes with the new file included.
7. No diffs outside: `apps/server/tests/http-surface.test.ts` (new), `scripts/surface_check.ts` (new), root `package.json` (one script line).
8. Works on a fresh clone after `pnpm install` + `pnpm build` (or the wrapper builds automatically).

---

## 10. Open items / assumed defaults

| Item | Status |
|---|---|
| Output format (question asked twice, unanswered) | **Assumed:** Vitest output + findings report (§6/§8). If plain Vitest output is preferred, drop the findings `it()` — zero other impact. |
| 413 test placement (auth-on w/ 1MB body vs. abuse-limits w/ small cap) | Implementer's choice; both spec'd as equivalent (§4.1) |
| Wrapper auto-build behavior | Wrapper should *check* for `dist`; building automatically is a nice-to-have, not required |
| Optional env-var target override (e.g., `SURFACE_TARGET_URL` to reuse the suite against a deployed host later) | Explicitly out of scope; noted as a possible future extension |
