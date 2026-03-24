# MCP Super-Server Backup & Recovery Strategy

## Overview

This document outlines the backup and recovery procedures for the MCP Super-Server, covering configuration, stateful components, and disaster recovery procedures.

## Current Implementation Status

| Component | Persistence | Backup Status | Notes |
|-----------|-------------|---------------|-------|
| Configuration | File-based | ✅ Automatic | Stored in `config/` |
| Ledger | In-memory | ⚠️ Manual | Currently ephemeral |
| Sessions | In-memory | ❌ N/A | Ephemeral by design |
| Service Registration | Zo-managed | ⚠️ Manual | Requires re-registration |

## Backup Components

### 1. Configuration Backup
- **Location**: `config/monitoring.json`, `config/alerts.yaml`
- **Frequency**: Daily via cron or agent
- **Retention**: 10 most recent backups
- **Method**: `scripts/backup.sh`

### 2. Ledger State (Current Limitation)
- **Current**: In-memory event store (ephemeral)
- **Future**: File-based or database persistence
- **Backup Strategy When Implemented**:
  - Streaming backup of event log
  - Point-in-time snapshots
  - Incremental backups for high volume

### 3. Service State
- **Registration**: Stored in Zo service registry
- **Backup**: Manual export via `list_user_services`
- **Recovery**: Re-register via `register_user_service`

## Backup Procedures

### Automated Daily Backup

```bash
# Add to crontab (edit with: crontab -e)
0 2 * * * /home/workspace/mcp-super-server/scripts/backup.sh >> /var/log/mcp-backup.log 2>&1
```

Or create a scheduled agent:

```bash
# Run at 2 AM daily
create_agent with rrule: "FREQ=DAILY;BYHOUR=2;BYMINUTE=0"
```

### Manual Backup

```bash
cd /home/workspace/mcp-super-server
bash scripts/backup.sh
```

### Backup Output

```
backups/
├── mcp_backup_YYYYMMDD_HHMMSS.tar.gz
├── mcp_backup_YYYYMMDD_HHMMSS.tar.gz
└── ... (last 10 retained)
```

## Restore Procedures

### Full Restore

```bash
# List available backups
ls -la /home/workspace/mcp-super-server/backups/

# Restore from specific backup
bash /home/workspace/mcp-super-server/scripts/restore.sh mcp_backup_20260324_101500.tar.gz

# Verify restoration
bash /home/workspace/mcp-super-server/scripts/health_check.sh
```

### Service Recovery

If the service fails to start:

```bash
# Check service status
service_doctor mcp-super-server

# Force restart
update_user_service --service_id svc_xxx

# Or re-register if needed
register_user_service --label mcp-super-server --protocol http --local_port 3000 --entrypoint "node dist/http.js" --workdir /home/workspace/mcp-super-server/apps/server
```

## Recovery Time Objectives (RTO)

| Scenario | RTO | Procedure |
|----------|-----|-----------|
| Config corruption | 5 min | Restore from backup |
| Service crash | 2 min | Auto-restart via supervisor |
| Full server loss | 15 min | Re-register service + restore config |
| Ledger data loss | N/A | Currently ephemeral (see roadmap) |

## Recovery Point Objectives (RPO)

| Component | RPO | Method |
|-----------|-----|--------|
| Configuration | 24 hours | Daily backups |
| Ledger | N/A | Ephemeral (no persistence yet) |
| Monitoring data | Real-time | Loki retention (7 days) |

## Future Roadmap

### Phase 1: Persistent Ledger (Q2 2026)
- File-based event store with append-only log
- Automated snapshots every hour
- Streaming backup to object storage

### Phase 2: Database Integration (Q3 2026)
- SQLite or PostgreSQL backend
- Transactional consistency
- Point-in-time recovery

### Phase 3: Distributed State (Q4 2026)
- Multi-node replication
- Consensus-based durability
- Geographic distribution

## Testing Recovery

Monthly disaster recovery drill:

```bash
# 1. Simulate failure
mv /home/workspace/mcp-super-server/config /home/workspace/mcp-super-server/config.simulated_failure

# 2. Restore from backup
bash /home/workspace/mcp-super-server/scripts/restore.sh $(ls -t backups/*.tar.gz | head -1)

# 3. Verify health
bash /home/workspace/mcp-super-server/scripts/health_check.sh

# 4. Record results
echo "Recovery test: $(date) - SUCCESS/FAIL" >> /var/log/recovery-tests.log
```

## Monitoring Backup Health

Track backup success via scheduled agent:

```bash
# Create monitoring agent
create_agent \
  --instruction "Check that backup files exist in /home/workspace/mcp-super-server/backups/ and are recent (within 25 hours). If backups are stale or missing, send alert email." \
  --rrule "FREQ=DAILY;BYHOUR=9;BYMINUTE=0" \
  --delivery_method email
```

## Security Considerations

1. **Backup Encryption**: Backups contain configuration but no secrets
2. **Access Control**: Backups are stored in user's workspace (private)
3. **Retention**: Automatic cleanup keeps only 10 most recent
4. **Off-site**: Future versions will support S3/R2 upload

## Troubleshooting

### Backup Failures

```bash
# Check disk space
df -h /home/workspace

# Check permissions
ls -la /home/workspace/mcp-super-server/scripts/backup.sh

# Run with debug
bash -x /home/workspace/mcp-super-server/scripts/backup.sh
```

### Restore Failures

```bash
# Verify backup integrity
tar -tzf mcp_backup_YYYYMMDD_HHMMSS.tar.gz

# Check manifest
tar -xzf mcp_backup_YYYYMMDD_HHMMSS.tar.gz -O | grep MANIFEST
```

## Contact & Support

For backup/restore issues:
- Check RUNBOOK.md for operational procedures
- Review service logs: `/dev/shm/mcp-super-server*.log`
- Contact: support via Zo Computer help system
