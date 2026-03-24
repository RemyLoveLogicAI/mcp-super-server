#!/bin/bash
# MCP Super-Server Backup Script
# Backs up configuration, ledger state, and service metadata

set -e

BACKUP_DIR="/home/workspace/mcp-super-server/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="mcp_backup_${TIMESTAMP}"
WORKSPACE="/home/workspace/mcp-super-server"

echo "=========================================="
echo "MCP Super-Server Backup"
echo "=========================================="
echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "Backup Name: ${BACKUP_NAME}"
echo "=========================================="

# Create backup directory
mkdir -p "${BACKUP_DIR}/${BACKUP_NAME}"

echo "[1/4] Backing up configuration..."
if [ -d "${WORKSPACE}/config" ]; then
    cp -r "${WORKSPACE}/config" "${BACKUP_DIR}/${BACKUP_NAME}/"
    echo "      ✓ Config backed up"
else
    echo "      ⚠ No config directory found"
fi

echo "[2/4] Backing up ledger state..."
# In-memory ledger doesn't have persistent files yet
# When file-based ledger is implemented, add backup logic here
mkdir -p "${BACKUP_DIR}/${BACKUP_NAME}/ledger"
echo "# Ledger Backup Placeholder" > "${BACKUP_DIR}/${BACKUP_NAME}/ledger/README.txt"
echo "# Timestamp: $(date)" >> "${BACKUP_DIR}/${BACKUP_NAME}/ledger/README.txt"
echo "# Note: Current ledger implementation is in-memory only." >> "${BACKUP_DIR}/${BACKUP_NAME}/ledger/README.txt"
echo "      ℹ Ledger state (in-memory) - manual export needed"

echo "[3/4] Backing up environment..."
cat > "${BACKUP_DIR}/${BACKUP_NAME}/environment.txt" << EOF
# MCP Server Environment Backup
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

## Service Information
SERVICE_ID: $(curl -s http://localhost:3100/loki/api/v1/status/buildinfo 2>/dev/null | jq -r '.version' || echo "Loki unavailable")

## Installed Services
echo "$(list_user_services 2>/dev/null || echo "Service list unavailable")"

## Node Version
$(node --version 2>/dev/null || echo "Node unavailable")

## Working Directory
${WORKSPACE}

## Last Backup Timestamp
${TIMESTAMP}
EOF
echo "      ✓ Environment info backed up"

echo "[4/4] Creating manifest..."
cat > "${BACKUP_DIR}/${BACKUP_NAME}/MANIFEST.json" << EOF
{
  "backup_name": "${BACKUP_NAME}",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "version": "0.0.1",
  "source": "${WORKSPACE}",
  "contents": [
    "config/",
    "ledger/",
    "environment.txt",
    "MANIFEST.json"
  ],
  "notes": [
    "Ledger is currently in-memory only - no persistent state backed up",
    "Service state must be restored manually via service_doctor or service registration"
  ]
}
EOF
echo "      ✓ Manifest created"

# Compress backup
echo ""
echo "Compressing backup..."
cd "${BACKUP_DIR}"
tar -czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}"
rm -rf "${BACKUP_NAME}"

BACKUP_SIZE=$(du -h "${BACKUP_NAME}.tar.gz" | cut -f1)
echo "      ✓ Compressed: ${BACKUP_SIZE}"

# Cleanup old backups (keep last 10)
echo ""
echo "Cleaning up old backups..."
cd "${BACKUP_DIR}"
ls -t *.tar.gz 2>/dev/null | tail -n +11 | xargs -r rm --
REMAINING=$(ls *.tar.gz 2>/dev/null | wc -l)
echo "      ✓ Kept ${REMAINING} most recent backups"

echo ""
echo "=========================================="
echo "Backup Complete: ${BACKUP_NAME}.tar.gz"
echo "Location: ${BACKUP_DIR}"
echo "Size: ${BACKUP_SIZE}"
echo "=========================================="
