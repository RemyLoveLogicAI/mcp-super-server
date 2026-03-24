# MCP Super-Server Security Audit

> Security considerations and hardening documentation for the MCP Super-Server.

---

## Security Controls Implemented

### C-001: Bearer Token Authentication

**Status:** ✅ Implemented

All endpoints except `/health` require bearer token authentication when `MCP_API_SECRET` is configured.

```bash
# Configure via environment variable
MCP_API_SECRET=your-secret-token-here
```

**Recommendations:**
- Use a cryptographically secure random token (32+ bytes)
- Rotate secrets periodically (recommended: 90 days)
- Store in Zo Secrets (Settings > Advanced) not in code

### C-002: CORS Restrictions

**Status:** ✅ Implemented

CORS headers are restricted to explicitly allowed origins via `MCP_ALLOWED_ORIGINS`.

```bash
# Configure allowed origins
MCP_ALLOWED_ORIGINS=https://your-frontend.com,https://admin.your-frontend.com
```

**Current Configuration:**
- Development: Allows all origins with warning
- Production: Restricted to configured origins

### C-003: Rate Limiting

**Status:** ✅ Implemented

Per-IP rate limiting prevents abuse.

```bash
# Configure rate limit (requests per minute)
MCP_RATE_LIMIT=100
```

**Default:** 100 requests/minute per IP

### H-001: Input Validation

**Status:** ✅ Implemented

- Request body size limit: `MCP_MAX_BODY_SIZE` (default 1MB)
- Content-type validation: Only `application/json` accepted for POST
- JSON parsing validation

### H-002: Security Headers

**Status:** ✅ Implemented

All responses include:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Content-Security-Policy: default-src 'self'`
- `Strict-Transport-Security` (when auth enabled)

### H-003: Sanitized Error Responses

**Status:** ✅ Implemented

Error responses contain only:
- Error message (generic)
- Error code
- Request ID (for debugging)

No stack traces or internal details exposed.

---

## Authentication & Authorization

### Tool Gate Policies

| Mode | Read Operations | Write Operations | Use Case |
|------|-----------------|------------------|----------|
| `permissive` | Auto-approve | Auto-approve | Development only |
| `read_only` | Auto-approve | Deny | Sandboxed testing |
| `write_approval` | Auto-approve | Require human | Production (default) |

### Identity Resolution

- Platform identity → Canonical user mapping
- Cross-platform identity linking
- Audit trail for identity operations

---

## Data Security

### Event Ledger

**In-Memory Mode (Default):**
- Events stored in process memory
- Lost on restart
- Suitable for development/testing

**Supabase Mode (Production):**
- Persistent event storage
- Row-level security recommended
- Enable encryption at rest

### Tool Call Audit

All tool invocations are logged with:
- Session ID
- Tool ID
- Timestamp
- Decision (allow/deny/require_human)
- Duration

---

## Network Security

### Endpoints Exposure

| Endpoint | Public | Auth Required | Notes |
|----------|--------|---------------|-------|
| `/` | Yes | No | Basic info only |
| `/health` | Yes | No | Required for load balancers |
| `/status` | Yes | Yes | Server metrics |
| `/voice/session` | Yes | Yes | Session creation |
| `/tool/invoke` | Yes | Yes | Tool execution |

### HTTPS

- Zo Computer services automatically use HTTPS
- Self-hosted deployments should use reverse proxy (nginx, traefik)
- Enable HSTS in production

---

## Known Security Considerations

### 1. Rate Limiting Scope

**Issue:** Rate limiting is per-IP, not per-user.

**Mitigation:** Implement user-scoped rate limiting for authenticated endpoints.

**Priority:** Medium

### 2. Session Management

**Issue:** Sessions are in-memory and don't expire.

**Mitigation:** Implement session timeout and cleanup.

**Priority:** High for production

### 3. Tool Sandbox

**Issue:** Tool execution is not fully sandboxed.

**Mitigation:** Implement sandboxed execution environment for untrusted tools.

**Priority:** High for multi-tenant deployments

### 4. Ledger Encryption

**Issue:** Event data is not encrypted at rest in Supabase.

**Mitigation:** Enable Supabase encryption and consider field-level encryption for sensitive data.

**Priority:** Medium

---

## Security Checklist

### Pre-Production

- [ ] Set `MCP_API_SECRET` to strong random token
- [ ] Configure `MCP_ALLOWED_ORIGINS` to production domains
- [ ] Adjust `MCP_RATE_LIMIT` based on expected traffic
- [ ] Set `GATE_MODE=write_approval`
- [ ] Enable HTTPS (automatic on Zo Computer)
- [ ] Configure Supabase with row-level security (if using persistence)
- [ ] Review and rotate any hardcoded secrets

### Ongoing

- [ ] Rotate `MCP_API_SECRET` every 90 days
- [ ] Monitor rate limit alerts
- [ ] Audit tool call logs weekly
- [ ] Review identity linking audit trail
- [ ] Check for security updates monthly

---

## Incident Response

See [RUNBOOK.md](./RUNBOOK.md) for incident response procedures.

### Security Incident Classification

| Level | Description | Example |
|-------|-------------|---------|
| Critical | Data breach, unauthorized access | API key leaked, session hijacking |
| High | Vulnerability exploited | Rate limit bypass, tool sandbox escape |
| Medium | Policy violation | Excessive rate limiting, unauthorized origin |
| Low | Best practice deviation | Missing security header |

---

## Compliance Considerations

### GDPR (if processing EU user data)

- Implement data retention policies
- Provide data export functionality
- Implement right to erasure

### SOC 2 Type II

- Maintain audit logs (implemented)
- Implement access controls (implemented)
- Regular security reviews (recommended)

---

## Security Contacts

- **Primary:** Zo Computer Security (security@zocomputer.com)
- **Secondary:** Engineering Lead
- **Escalation:** CTO / VP Engineering

---

*Last updated: 2026-03-24*
*Next review: 2026-06-24*