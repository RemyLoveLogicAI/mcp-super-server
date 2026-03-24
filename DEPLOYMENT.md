# MCP Super-Server Deployment Guide

> Deployment documentation for the MCP Super-Server — A Unified Architecture for Voice-Native Agentic Systems.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Service Registration](#service-registration)
4. [Environment Configuration](#environment-configuration)
5. [Docker Deployment](#docker-deployment)
6. [Zo Computer Deployment](#zo-computer-deployment)

---

## Prerequisites

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Node.js | 22.x | 22.x LTS |
| pnpm | 9.15.0+ | 9.15.0+ |
| Bun | 1.0+ | Latest |
| Memory | 2 GB | 4 GB |
| Disk | 10 GB | 20 GB |

### Required Tools

```bash
# Core package managers
node --version    # v22.x
pnpm --version    # 9.15.0+
bun --version     # 1.0+

# For Docker deployment
docker --version
docker-compose --version

# For Zo Computer deployment (optional)
zo --version
```

### External Dependencies

- **Supabase** (optional): For persistent ledger storage
  - Project URL and API key required if using Supabase persistence
  - Configure in environment variables

---

## Installation

### 1. Clone and Install

```bash
cd /home/workspace/mcp-super-server

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run type checking
pnpm typecheck

# Run tests
pnpm test
```

### 2. Verify Installation

```bash
# Test all packages
pnpm test

# Expected output:
# ✓ @mss/orchestrator (10 tests)
# ✓ @mss/server (4 tests)
# ✓ @mss/voice (7 tests)
# ✓ @mss/worlds (5 tests)
# ✓ @mss/tools (3 tests)
# ✓ @mss/ledger (2 tests)
# Total: 31 tests passing
```

### 3. Package Structure

```
mcp-super-server/
├── apps/
│   ├── server/           # Main MCP super-server entry
│   ├── dashboard/        # Observability UI (Agentic Horizon)
│   └── aetheria/         # Flagship demonstrator
├── packages/
│   ├── core/             # Events, resources, policies, contracts
│   ├── gateway/          # Channel adapters + transport
│   ├── voice/            # Voice transport + interrupt semantics
│   ├── context-fabric/   # Unified state+memory substrate
│   ├── orchestrator/     # Agent planning + delegation
│   ├── tools/            # Capability registry + sandbox
│   ├── worlds/           # Ink/Glulx runtimes + simulation
│   ├── identity/         # Canonical identity resolution
│   ├── ledger/           # Append-only event store
│   └── mesh/             # Capability routing + federation
└── docs/
    ├── whitepaper.md     # Canonical architecture spec
    └── patent-draft.md   # Claim surfaces / novelty
```

---

## Service Registration

### Zo Computer Service Registration

Register the MCP Super-Server as a managed service:

```bash
# Register the main server as a user service
zo service register \
  --name mcp-super-server \
  --port 3000 \
  --command "node /home/workspace/mcp-super-server/apps/server/dist/index.js" \
  --env NODE_ENV=production \
  --env PORT=3000
```

Or use the Zo Computer dashboard:

1. Navigate to [Settings > Services](/?t=sites&s=services)
2. Click "Add Service"
3. Configure:
   - **Label**: `mcp-super-server`
   - **Protocol**: `http`
   - **Port**: `3000`
   - **Entrypoint**: `/home/workspace/mcp-super-server/apps/server/dist/index.js`
   - **Working Directory**: `/home/workspace/mcp-super-server`
   - **Environment Variables**:
     - `NODE_ENV=production`
     - `PORT=3000`

### Service Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `3000` |
| `SUPABASE_URL` | Supabase project URL (optional) | - |
| `SUPABASE_KEY` | Supabase API key (optional) | - |
| `GATE_MODE` | Tool gate mode | `write_approval` |
| `MAX_CALLS_PER_SESSION` | Tool call limit | `10` |
| `AGENT_ID` | Default agent identifier | `default-agent` |

---

## Environment Configuration

### Development Environment

Create `.env` in project root:

```bash
# /home/workspace/mcp-super-server/.env
NODE_ENV=development
PORT=3000
AGENT_ID=dev-agent
GATE_MODE=permissive
MAX_CALLS_PER_SESSION=100
```

### Production Environment

```bash
# /home/workspace/mcp-super-server/.env.production
NODE_ENV=production
PORT=3000
AGENT_ID=prod-agent
GATE_MODE=write_approval
MAX_CALLS_PER_SESSION=50

# Optional: Supabase for persistent ledger
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
```

### Package-Specific Configuration

#### Ledger Persistence

```typescript
// In-memory (default)
import { createInMemoryLedger } from "@mss/ledger";
const ledger = createInMemoryLedger();

// Supabase persistence
import { createSupabaseLedger } from "@mss/ledger/supabase";
const ledger = createSupabaseLedger(supabaseClient);
```

#### Tool Gate Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `permissive` | Auto-approve all tools | Development, testing |
| `read_only` | Auto-approve reads, deny writes | Sandboxed environments |
| `write_approval` | Auto-approve reads, require human for writes | Production (default) |

---

## Docker Deployment

### Build and Run

```bash
# Build the Docker image
cd /home/workspace/mcp-super-server
docker build -t mcp-super-server .

# Run with docker-compose
docker-compose up -d

# Or run directly
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  mcp-super-server
```

### docker-compose.yml

```yaml
services:
  server:
    build:
      context: .
      dockerfile: apps/server/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - GATE_MODE=write_approval
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

---

## Zo Computer Deployment

### Deploy as Zo Site

For a full-featured deployment with custom dependencies:

1. Create `zosite.json`:

```json
{
  "name": "mcp-super-server",
  "type": "custom",
  "entrypoint": "apps/server/dist/index.js",
  "port": 3000,
  "buildCommand": "pnpm build",
  "env": {
    "NODE_ENV": "production",
    "PORT": "3000"
  }
}
```

2. Deploy via Zo CLI or dashboard

### Deploy API Routes to Zo Space

For lightweight API-only deployment:

```typescript
// Create API route at /api/mcp
import type { Context } from "hono";

export default async (c: Context) => {
  const server = createMCPServer({
    ledger: { type: "memory" },
    gate: { maxCallsPerSession: 10, defaultApproval: "require_human" },
    meta: { name: "mcp-super-server", version: "0.0.1", environment: "production" }
  });
  
  await server.start();
  return c.json({ status: "started", version: "0.0.1" });
};
```

---

## Post-Deployment Verification

### Health Check

```bash
curl http://localhost:3000/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2026-03-24T10:05:00.000Z",
  "uptime": 3600000,
  "checks": {
    "ledger": true,
    "identity": true,
    "orchestrator": true
  },
  "version": "0.0.1"
}
```

### Quick Test

```bash
# Test voice session creation
curl -X POST http://localhost:3000/voice/session \
  -H "Content-Type: application/json" \
  -d '{"platform": "discord", "platformId": "user123"}'

# Expected response:
{
  "sessionId": "uuid",
  "state": "idle"
}
```

---

## References

- [Whitepaper](./docs/whitepaper.md) — Canonical architecture specification
- [Patent Draft](./docs/patent-draft.md) — Claim surfaces and novelty mapping
- [API Documentation](./API.md) — API endpoints and contracts
- [Runbook](./RUNBOOK.md) — Operational procedures

---

*Generated by AGENT-06: Documentation & Runbooks*
