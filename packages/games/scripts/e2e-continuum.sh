#!/usr/bin/env bash
# End-to-end: real Continuum daemon + mss CLI + arcade MCP server, all separate processes.
# Usage: CONTINUUM_BIN=continuum ./e2e-continuum.sh      (continuum = `pip install -e` of the Continuum repo)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; MSS="$HERE/../bin/mss"
CONTINUUM_BIN="${CONTINUUM_BIN:-continuum}"
T="$(mktemp -d)"; PORT="${PORT:-7811}"
export CONTINUUM_URL="http://127.0.0.1:$PORT" MSS_HOME="$T/mss"
pass=0; fail=0
check() { if eval "$2"; then echo "PASS  $1"; pass=$((pass+1)); else echo "FAIL  $1"; fail=$((fail+1)); fi; }

"$CONTINUUM_BIN" serve --world "$T/valley" --port "$PORT" --days-per-sec 20 > "$T/daemon.log" 2>&1 &
DPID=$!; for i in $(seq 50); do curl -sf "$CONTINUUM_URL/api/state" >/dev/null && break; sleep 0.2; done

out=$(MSS_ACTOR=remy "$MSS" games);                      echo "$out" | head -3
check "E1 mss games: Continuum live and healthy"        'echo "$out" | grep -q "Continuum.*live.*acts"'
out=$(MSS_ACTOR=remy "$MSS" continuum status)
check "E2 mss continuum status reads the daemon"        'echo "$out" | grep -q "based_on=0"'

# MCP session as Claude: request a permanent act
mkfifo "$T/in"; (MSS_ACTOR=claude "$MSS" mcp < "$T/in" > "$T/out" 2>"$T/mcp.err" &) ; exec 3>"$T/in"
rpc() { echo "$1" >&3; for i in $(seq 100); do [ "$(wc -l < "$T/out")" -ge "$2" ] && break; sleep 0.1; done; sed -n "${2}p" "$T/out"; }
rpc '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"e2e","version":"1"}}}' 1 >/dev/null
tl=$(rpc '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' 2)
check "E3 MCP lists games (continuum, ledgermon) and no approve tool" 'echo "$tl" | grep -q continuum_commit && echo "$tl" | grep -q ledgermon_battle && ! echo "$tl" | grep -q "\"name\":\"arcade_approve\""'
req='"action":"plant","cells":"14-16,4","intent":"Shade the headwaters springs","based_on":0'
r=$(rpc "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"continuum_commit\",\"arguments\":{$req}}}" 3)
APV=$(echo "$r" | grep -o 'apv_[0-9a-f]\{10\}' | head -1)
check "E4 MCP commit returns an approval request, writes nothing" '[ -n "$APV" ] && [ "$("$CONTINUUM_BIN" log --server "$CONTINUUM_URL")" = "No acts yet." ]'
r=$(rpc "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\",\"params\":{\"name\":\"continuum_commit\",\"arguments\":{$req,\"approval_id\":\"$APV\"}}}" 4)
check "E5 using it before a human approves is refused" 'echo "$r" | grep -q "has not approved it yet"'
MSS_ACTOR=remy "$MSS" approve "$APV" >/dev/null
r=$(rpc "{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"tools/call\",\"params\":{\"name\":\"continuum_commit\",\"arguments\":{$req,\"approval_id\":\"$APV\"}}}" 5)
check "E6 after 'mss approve' (another process) the MCP commit lands" 'echo "$r" | grep -q "Committed permanently" && echo "$r" | grep -q "claude via mss"'
r=$(rpc "{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"tools/call\",\"params\":{\"name\":\"continuum_commit\",\"arguments\":{$req,\"approval_id\":\"$APV\"}}}" 6)
check "E7 the approval cannot be replayed" 'echo "$r" | grep -q "is used"'

out=$(MSS_ACTOR=remy "$MSS" continuum plant 20-21,10 --why "Windbreak for the east fields" --yes)
check "E8 mss CLI commit (human at terminal, --yes)"    'echo "$out" | grep -q "remy via mss"'
out=$(MSS_ACTOR=remy "$MSS" continuum plant 25,10 --why "Late idea without looking" --based-on 0 --yes)
check "E9 stale based_on refused with what changed"     'echo "$out" | grep -q "since you looked"'
out=$("$CONTINUUM_BIN" log --server "$CONTINUUM_URL")
check "E10 Continuum's own CLI sees both acts"          'echo "$out" | grep -q "claude via mss" && echo "$out" | grep -q "remy via mss"'
out=$(MSS_ACTOR=remy "$MSS" ledgermon battle did:zo:remy-main spd=80,sta=50,acc=90,tem=20,app=40 did:zo:remy-r1 spd=60,sta=50,acc=70,tem=10,app=30)
check "E11 LEDGERMON battle through the same CLI"        'echo "$out" | grep -q "winner did:zo:remy-main"'

r=$(rpc '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"stories_play","arguments":{"story":"morning-decision","restart":true,"context":{"weather_description":"Rain taps the window."}}}}' 7)
check "E13 story game over MCP with Claude-supplied context" 'echo "$r" | grep -q "Rain taps the window"'

exec 3>&-; kill $DPID; wait $DPID 2>/dev/null
out=$("$CONTINUUM_BIN" verify --world "$T/valley")
check "E12 Continuum ledger (with arcade acts) verifies from genesis" 'echo "$out" | grep -q "VERIFY PASS"'
echo; echo "$pass passed, $fail failed   (scratch: $T)"; [ $fail -eq 0 ]
