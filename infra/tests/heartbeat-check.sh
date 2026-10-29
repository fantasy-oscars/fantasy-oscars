#!/usr/bin/env bash
# Unit tests for infra/monitoring-repo/scripts/check-heartbeats.sh. Needs bash 4+, jq.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/infra/monitoring-repo/scripts/check-heartbeats.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
pass() { echo "PASS $*"; }
fail() {
  echo "FAIL $*"
  exit 1
}
NOW="$(date -u -d '2026-03-01T12:00:00Z' +%s)"
hb() { printf '{"name":"%s","timestamp":"%s"}\n' "$1" "$2" >"$T/$1.json"; }

hb backup 2026-03-01T03:00:00Z
hb healthcheck 2026-03-01T11:50:00Z
hb restore-verify 2026-02-10T05:30:00Z
"$SCRIPT" "$T" "$NOW" >/dev/null || fail "fresh heartbeats reported stale"
pass "all fresh -> exit 0"

hb backup 2026-02-28T09:00:00Z # 27h old
out="$("$SCRIPT" "$T" "$NOW" || true)"
echo "$out" | grep -q '^backup: .*27h old' || fail "27h-old backup not flagged: $out"
echo "$out" | grep -qE 'healthcheck|restore-verify' && fail "fresh ones flagged"
pass "backup 27h old -> only backup flagged"

hb backup 2026-02-28T11:00:00Z # 25h: inside limit
"$SCRIPT" "$T" "$NOW" >/dev/null || fail "25h-old backup should still be fresh"
pass "25h old is within the 26h limit"

hb restore-verify 2026-01-20T05:30:00Z # 40 days
out="$("$SCRIPT" "$T" "$NOW" || true)"
echo "$out" | grep -q '^restore-verify:' || fail "40-day-old restore-verify not flagged"
pass "restore-verify 40 days old -> flagged (limit 35 days)"

hb restore-verify 2026-02-01T05:30:00Z # 28 days
"$SCRIPT" "$T" "$NOW" >/dev/null || fail "28-day-old restore-verify should be fresh"
pass "restore-verify 28 days old -> fresh"

rm "$T/healthcheck.json"
out="$("$SCRIPT" "$T" "$NOW" || true)"
echo "$out" | grep -q '^healthcheck: no heartbeat file' || fail "missing file not flagged"
pass "missing file -> flagged"

echo '{"timestamp":"garbage"}' >"$T/healthcheck.json"
out="$("$SCRIPT" "$T" "$NOW" || true)"
echo "$out" | grep -q '^healthcheck: unreadable' || fail "garbage timestamp not flagged"
pass "garbage timestamp -> flagged"
echo "ALL HEARTBEAT-CHECK TESTS PASSED"
