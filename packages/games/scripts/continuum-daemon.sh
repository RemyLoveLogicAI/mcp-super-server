#!/usr/bin/env bash
# Install, uninstall, or check status of the Continuum daemon as a macOS LaunchAgent.
#
#   continuum-daemon.sh install     load the service (RunAtLoad + KeepAlive)
#   continuum-daemon.sh uninstall   unload and remove the service
#   continuum-daemon.sh status      show whether it's loaded and probe the HTTP API
#
# World: ~/.continuum/worlds/valley  |  Port: 7777  |  Logs: ~/.continuum/daemon*.log
set -euo pipefail

LABEL="ai.lovelogic.continuum"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
UID_N="$(id -u)"

cmd="${1:-}"

case "$cmd" in
  install)
    [ -f "$PLIST" ] || { echo "missing plist: $PLIST" >&2; exit 1; }
    mkdir -p "$HOME/.continuum/worlds/valley"
    launchctl bootout "gui/${UID_N}/${LABEL}" 2>/dev/null || true
    launchctl bootstrap "gui/${UID_N}" "$PLIST"
    launchctl kickstart -k "gui/${UID_N}/${LABEL}"
    echo "installed: ${LABEL}"
    ;;
  uninstall)
    launchctl bootout "gui/${UID_N}/${LABEL}" 2>/dev/null || true
    echo "uninstalled: ${LABEL}"
    ;;
  status)
    if launchctl print "gui/${UID_N}/${LABEL}" >/dev/null 2>&1; then
      echo "loaded: ${LABEL}"
      curl -sf http://127.0.0.1:7777/api/state | python3 -m json.tool 2>/dev/null \
        || echo "loaded but HTTP API not responding yet"
    else
      echo "not loaded: ${LABEL}"
      exit 1
    fi
    ;;
  *)
    echo "usage: $(basename "$0") install|uninstall|status" >&2
    exit 2
    ;;
esac
