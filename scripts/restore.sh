#!/bin/bash
# MCP Super-Server Restore Script
# Restores configuration from backup

set -e

BACKUP_DIR="/home/workspace/mcp-super-server/backups"
WORKSPACE="/home/workspace/mcp-super-server"

show_usage() {
    echo "Usage: $0 <backup_file>"
    echo ""
    echo "Available backups:"
    ls -1 "${BACKUP_DIR}"/*.tar.gz 2>/dev/null | while read f; do
        echo "  - $(basename $f)"
    done
    exit 1
}

if [ $# -ne 1 ]; then
    show_usage
fi

BACKUP_FILE="$1"

# Handle full path or just filename
if [ ! -f "${BACKUP_FILE}" ]; then
    BACKUP_FILE="${BACKUP_DIR}/${BACKUP_FILE}"
fi

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "Error: Backup file not found: ${BACKUP_FILE}"
    show_usage
fi

BACKUP_NAME=$(basename "${BACKUP_FILE}" .tar.gz)
RESTORE_DIR="/tmp/mcp_restore_${BACKUP_NAME}"

echo "=========================================="
echo "MCP Super-Server Restore"
echo "=========================================="
echo "Backup: ${BACKUP_NAME}"
echo "Source: ${BACKUP_FILE}"
echo "Time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "=========================================="

# Create restore directory
mkdir -p "${RESTORE_DIR}"

# Extract backup
echo ""
echo "[1/4] Extracting backup..."
tar -xzf "${BACKUP_FILE}" -C "${RESTORE_DIR}"
echo "      ✓ Extracted to ${RESTORE_DIR}"

# Verify manifest
echo ""
echo "[2/4] Verifying backup integrity..."
if [ -f "${RESTORE_DIR}/${BACKUP_NAME}/MANIFEST.json" ]; then
    echo "      ✓ Manifest found"
    echo "      Backup info:"
    cat "${RESTORE_DIR}/${BACKUP_NAME}/MANIFEST.json" | jq -r '"        Created: \(.timestamp)"' 2>/dev/null || echo "        (jq not available for parsing)"
else
    echo "      ⚠ Warning: Manifest not found, proceeding anyway"
fi

# Restore configuration
echo ""
echo "[3/4] Restoring configuration..."
if [ -d "${RESTORE_DIR}/${BACKUP_NAME}/config" ]; then
    # Backup current config first
    if [ -d "${WORKSPACE}/config" ]; then
        mv "${WORKSPACE}/config" "${WORKSPACE}/config.bak.$(date +%s)"
        echo "      ✓ Current config backed up to config.bak.*"
    fi
    cp -r "${RESTORE_DIR}/${BACKUP_NAME}/config" "${WORKSPACE}/"
    echo "      ✓ Configuration restored"
else
    echo "      ⚠ No configuration found in backup"
fi

# Restore ledger (placeholder - currently in-memory)
echo ""
echo "[4/4] Ledger state..."
echo "      ℹ Note: Ledger is in-memory only. State restoration requires manual export/import."
echo "      ℹ See BACKUP_STRATEGY.md for details on persistent ledger implementation."

# Cleanup
echo ""
echo "Cleaning up..."
rm -rf "${RESTORE_DIR}"
echo "      ✓ Temporary files removed"

echo ""
echo "=========================================="
echo "Restore Complete"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Verify configuration: cat ${WORKSPACE}/config/*"
echo "2. Restart services if needed: service_doctor mcp-super-server"
echo "3. Run health check: bash ${WORKSPACE}/scripts/health_check.sh"
echo ""
echo "Current config backup location:"
ls -1d "${WORKSPACE}/config.bak."* 2>/dev/null | tail -1 || echo "(none)"
echo "=========================================="
