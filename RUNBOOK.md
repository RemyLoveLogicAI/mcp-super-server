# MCP Super-Server Operational Runbook

> Operational procedures for the MCP Super-Server — Voice-Native Agentic Systems Platform.

---

## Table of Contents

1. [Service Management](#service-management)
2. [Health Check Procedures](#health-check-procedures)
3. [Troubleshooting](#troubleshooting)
4. [Scaling Considerations](#scaling-considerations)
5. [Incident Response](#incident-response)

---

## Service Management

### Restarting Services

#### Zo Computer Service

```bash
# Restart via CLI
zo service restart mcp-super-server

# Or via dashboard:
# 1. Navigate to [Settings > Services](/?t=sites&s=services)
# 2. Find "mcp-super-server"
# 3. Click "Restart"
```

#### Docker Deployment

```bash
cd /home/workspace/mcp-super-server

# Restart with docker-compose
docker-compose restart

# Full rebuild and restart
docker-compose down
docker-compose up -d --build

# View logs
docker-compose logs -f server
```

#### Manual Restart

```bash
cd /home/workspace/mcp-super-server

# Stop existing process
pkill -f "node.*mcp-super-server"

# Rebuild if needed
pnpm build

# Start server
cd apps/server
node dist/index.js

# Or with environment variables
NODE_ENV=production PORT=3000 node dist/index.js
```

### Service Status Check

```bash
# Check if service is running
pgrep -f "mcp-super-server"

# Check port binding
lsof -i :3000

# Check service logs
tail -f /var/log/mcp-super-server.log
```

### Graceful Shutdown

```bash
# Send SIGTERM for graceful shutdown
kill -TERM $(pgrep -f "mcp-super-server")

# Wait for shutdown (max 30s)
sleep 5

# Force kill if needed
kill -KILL $(pgrep -f "mcp-super-server")
```

---

## Health Check Procedures

### Automated Health Checks

The server exposes a health endpoint:

```bash
# Basic health check
curl http://localhost:3000/health | jq

# Expected healthy response:
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

### Component-Specific Checks

#### Ledger Health

```bash
# Check ledger connectivity
curl http://localhost:3000/health/ledger

# For Supabase-backed ledger:
curl -H "Authorization: Bearer $SUPABASE_KEY" \
  "$SUPABASE_URL/rest/v1/health"
```

#### Voice Session Health

```bash
# Create test session
curl -X POST http://localhost:3000/voice/session \
  -H "Content-Type: application/json" \
  -d '{"platform": "test", "platformId": "health-check"}'

# Verify session exists
curl http://localhost:3000/voice/sessions
```

#### Tool Gate Health

```bash
# Test tool gate evaluation
curl -X POST http://localhost:3000/tools/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "test-session",
    "tool_id": "read:file",
    "requested_effect": "read_only"
  }'
```

### Log Monitoring

```bash
# View structured logs
tail -f /dev/shm/mcp-super-server.log | jq

# Filter for errors
tail -f /dev/shm/mcp-super-server.log | jq 'select(.level == "error")'

# View Loki logs
curl -G -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={filename="/dev/shm/mcp-super-server.log"}' \
  --data-urlencode "limit=100"
```

---

## Troubleshooting

### Common Issues

#### Issue: Service Won't Start

**Symptoms:**
- Port already in use
- Build errors
- Module resolution errors

**Resolution:**

```bash
# Check port usage
lsof -i :3000
kill -9 $(lsof -t -i :3000)

# Clean and rebuild
pnpm clean  # if available
rm -rf apps/server/dist
pnpm build

# Verify dependencies
pnpm install
pnpm typecheck
```

#### Issue: Ledger Connection Failures

**Symptoms:**
- Health check shows `ledger: false`
- Events not persisting
- Replay returns empty

**Resolution:**

```bash
# Check Supabase connectivity
curl -I "$SUPABASE_URL"

# Verify credentials
echo $SUPABASE_URL
echo $SUPABASE_KEY

# Switch to in-memory ledger (temporary)
# Set in config: ledger: { type: "memory" }

# Check ledger migrations
cat packages/ledger/migrations/001_create_tables.sql
```

#### Issue: Voice Session Errors

**Symptoms:**
- Session creation fails
- Barge-in not working
- Audio events not processed

**Resolution:**

```bash
# Check voice package
pnpm test -- packages/voice

# Verify FSM state transitions
# Check packages/voice/tests/fsm.test.ts

# Review session state
# Use dashboard at /dashboard to inspect active sessions
```

#### Issue: Tool Gate Denying Valid Requests

**Symptoms:**
- Read operations being denied
- Human approval prompts for safe operations
- Budget exceeded errors

**Resolution:**

```bash
# Check gate mode
# GATE_MODE should be: permissive | read_only | write_approval

# Verify tool registration
curl http://localhost:3000/tools/registry

# Reset budget for session
curl -X POST http://localhost:3000/tools/reset-budget \
  -d '{"session_id": "<session-id>"}'
```

#### Issue: High Memory Usage

**Symptoms:**
- OOM errors
- Slow response times
- Increasing memory footprint

**Resolution:**

```bash
# Check memory usage
ps aux | grep mcp-super-server

# Monitor in real-time
watch -n 5 'ps -o pid,vsz,rss,comm -p $(pgrep -f mcp-super-server)'

# Check for memory leaks in:
# - Voice sessions (not being cleaned up)
# - Ledger events (unbounded growth)
# - Context fabric (orphaned contexts)

# Restart to clear memory
zo service restart mcp-super-server
```

### Log Analysis

```bash
# Search for errors
grep "ERROR" /dev/shm/mcp-super-server.log

# Find specific error patterns
grep -E "(Timeout|ECONNREFUSED|ENOMEM)" /dev/shm/mcp-super-server.log

# Count error frequency
grep "ERROR" /dev/shm/mcp-super-server.log | cut -d' ' -f1 | sort | uniq -c
```

---

## Scaling Considerations

### Horizontal Scaling

#### Multi-Instance Deployment

```yaml
# docker-compose.scale.yml
services:
  server-1:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - INSTANCE_ID=server-1
  
  server-2:
    build: .
    ports:
      - "3001:3000"
    environment:
      - NODE_ENV=production
      - INSTANCE_ID=server-2
  
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
```

#### Load Balancing Considerations

- **Session Stickiness:** Voice sessions must route to the same instance
- **Ledger Consistency:** Use Supabase-backed ledger for shared state
- **Identity Resolution:** Shared identity store across instances

### Vertical Scaling

| Load Level | CPU | Memory | Sessions | Tool Calls/Min |
|------------|-----|--------|----------|----------------|
| Light | 1 core | 2 GB | 10 | 100 |
| Medium | 2 cores | 4 GB | 50 | 500 |
| Heavy | 4 cores | 8 GB | 200 | 2000 |
| Enterprise | 8+ cores | 16+ GB | 1000+ | 10000+ |

### Database Scaling (Supabase)

```sql
-- Monitor ledger table size
SELECT pg_size_pretty(pg_total_relation_size('events'));

-- Add retention policy (if needed)
DELETE FROM events WHERE created_at < NOW() - INTERVAL '90 days';

-- Index optimization
CREATE INDEX CONCURRENTLY idx_events_session_id ON events(session_id);
CREATE INDEX CONCURRENTLY idx_events_type ON events(event_type);
```

### Resource Limits

Configure resource constraints:

```bash
# Docker resource limits
docker run -m 4g --cpus=2 -p 3000:3000 mcp-super-server

# Node.js memory limits
NODE_OPTIONS="--max-old-space-size=4096" node dist/index.js

# Process limits (systemd)
# /etc/systemd/system/mcp-super-server.service
[Service]
MemoryMax=4G
CPUQuota=200%
```

---

## Incident Response

### Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|-----------------|----------|
| P1 | Critical | 15 min | Complete outage, data loss |
| P2 | High | 1 hour | Partial degradation, major feature down |
| P3 | Medium | 4 hours | Minor feature issues, performance degradation |
| P4 | Low | 24 hours | Cosmetic issues, non-urgent bugs |

### P1 Response: Complete Outage

1. **Immediate:** Restart service
   ```bash
   zo service restart mcp-super-server
   ```

2. **Verify:** Check health endpoint
   ```bash
   curl http://localhost:3000/health
   ```

3. **Communicate:** Notify stakeholders
   - Post in incident channel
   - Update status page

4. **Investigate:** Review logs
   ```bash
   tail -n 500 /dev/shm/mcp-super-server.log | grep ERROR
   ```

5. **Document:** Create post-mortem

### P2 Response: Partial Degradation

1. **Identify:** Which component is affected?
   ```bash
   curl http://localhost:3000/health | jq '.checks'
   ```

2. **Isolate:** Disable affected features if needed
   ```bash
   # Set gate mode to read_only as safety measure
   curl -X POST http://localhost:3000/config/gate-mode \
     -d '{"mode": "read_only"}'
   ```

3. **Mitigate:** Scale up or restart component

4. **Monitor:** Watch recovery
   ```bash
   watch -n 5 'curl -s http://localhost:3000/health | jq .status'
   ```

### Rollback Procedures

```bash
# Rollback to previous version
cd /home/workspace/mcp-super-server
git log --oneline -10
git checkout <previous-stable-commit>
pnpm install
pnpm build
zo service restart mcp-super-server

# Or use Docker tag
docker-compose down
docker pull mcp-super-server:previous-stable
docker-compose up -d
```

### Emergency Contacts

- **Primary:** Zo Computer Support (help@zocomputer.com)
- **Secondary:** Engineering Lead
- **Escalation:** CTO / VP Engineering

---

## Maintenance Windows

### Scheduled Maintenance

1. Announce maintenance window (24h advance)
2. Enable maintenance mode (if supported)
3. Stop incoming traffic
   ```bash
   # Disable at load balancer
   ```
4. Perform maintenance
5. Verify health checks pass
6. Re-enable traffic

### Database Maintenance

```bash
# Backup before maintenance
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Run migrations
pnpm migrate

# Verify migrations
pnpm migrate:status
```

---

## References

- [Deployment Guide](./DEPLOYMENT.md) — Installation and setup
- [Whitepaper](./docs/whitepaper.md) — Architecture specification
- [API Documentation](./API.md) — API endpoints
- [Architecture Diagram](./docs/architecture.d2) — System diagram

---

*Generated by AGENT-06: Documentation & Runbooks*
