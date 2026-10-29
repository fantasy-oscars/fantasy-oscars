#!/usr/bin/env bash
# healthcheck.sh / reboot-when-idle.sh scenario tests with stubbed host commands and a fake
# GitHub API. Needs: bash 4+, GNU coreutils, jq, openssl, python3, curl. No Docker required.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INFRA="$ROOT/infra"
T="$(mktemp -d)"
GHPORT=18766
pass() { echo "PASS $*"; }
fail() {
  echo "FAIL $*"
  exit 1
}
cleanup() {
  [ -n "${GHPID:-}" ] && kill "$GHPID" 2>/dev/null || true
  rm -rf "$T"
}
trap cleanup EXIT
mkdir -p "$T/bin" "$T/dockerroot" "$T/state"

# --- stubs: df, docker (info/inspect), fake compose (ps/logs)
cat >"$T/bin/df" <<'EOF'
#!/usr/bin/env bash
echo "Filesystem 1024-blocks Used Available Capacity Mounted on"
echo "x 100 ${FO_TEST_DISK:-40} 60 ${FO_TEST_DISK:-40}% /"
EOF
cat >"$T/bin/docker" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  info) echo "$FO_TEST_DOCKER_ROOT" ;;
  inspect) cat "$FO_TEST_INSPECT" ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$T/bin/df" "$T/bin/docker"
export PATH="$T/bin:$PATH"
export FO_TEST_DOCKER_ROOT="$T/dockerroot"
export FO_TEST_INSPECT="$T/inspect.txt"
export FO_TEST_PS_IDS="$T/ids.txt"
export FO_TEST_API_LOG="$T/api.log"
export FO_COMPOSE_CMD="$INFRA/tests/fake-compose.sh"
export FO_STATE_DIR="$T/state"
export FO_ENV_FILE="$T/env"
export FO_MEMINFO="$T/meminfo"
export FO_REBOOT_FLAG="$T/reboot-required"
export SITE_HOST=example.test
: >"$T/env"

healthy() {
  printf 'a\nb\nc\n' >"$T/ids.txt"
  printf 'db|running|healthy|0|0\napi|running|healthy|0|0\nweb|running|none|0|0\nmigrate|exited|none|0|0\n' >"$T/inspect.txt"
  printf 'MemTotal: 1000000 kB\nMemAvailable: 500000 kB\nSwapTotal: 2000000 kB\nSwapFree: 2000000 kB\n' >"$T/meminfo"
  printf '{"level":"info","msg":"request","status":200}\n{"level":"info","msg":"request","status":404}\n' >"$T/api.log"
  rm -f "$T/reboot-required"
  export FO_TEST_DISK=40
  export FO_TLS_PEM_CMD="cat $T/good.pem"
}
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$T/k" -out "$T/good.pem" -days 60 -subj /CN=example.test 2>/dev/null
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$T/k" -out "$T/soon.pem" -days 5 -subj /CN=example.test 2>/dev/null
export FO_TLS_PEM_CMD="cat $T/good.pem"

echo "== 1. all healthy (dry run): no alerts"
healthy
out="$("$INFRA/healthcheck.sh" --dry-run 2>&1)"
echo "$out"
echo "$out" | grep -q '^ALERT' && fail "unexpected alert"
pass "healthy host prints no alerts (heartbeat dry-run line only)"
echo "$out" | grep -q 'DRYRUN heartbeat heartbeats/healthcheck.json' || fail "no healthcheck heartbeat"

echo "== 2. every failure at once (dry run)"
healthy
export FO_TEST_DISK=91
export FO_TLS_PEM_CMD="cat $T/soon.pem"
for r in 1 2 3; do
  printf 'MemTotal: 1000000 kB\nMemAvailable: 50000 kB\nSwapTotal: 2000000 kB\nSwapFree: 500000 kB\n' >"$T/meminfo"
  out="$("$INFRA/healthcheck.sh" --dry-run 2>&1)"
  if [ "$r" -lt 3 ]; then echo "$out" | grep -q 'ALERT OPEN    memory-pressure.*consecutive' && fail "memory fired before 3 runs (swap-only expected)"; fi
done
printf 'db|running|unhealthy|0|0\napi|running|healthy|2|0\nweb|running|none|0|0\n' >"$T/inspect.txt"
printf 'db 0\napi 0\nweb 0\n' >"$T/state/restart-counts"
for i in $(seq 1 6); do echo '{"level":"info","msg":"request","status":503}' >>"$T/api.log"; done
echo '{"level":"error","msg":"request_error","status":500}' >>"$T/api.log"
echo 'not json at all' >>"$T/api.log"
touch -d '4 days ago' "$T/reboot-required"
out="$("$INFRA/healthcheck.sh" --dry-run 2>&1)"
echo "$out"
for k in disk-usage memory-pressure container-health tls-expiry api-5xx reboot-pending; do
  echo "$out" | grep -q "ALERT OPEN    $k" || fail "missing alert $k"
done
echo "$out" | grep 'api-5xx' | grep -q '6 API responses' || fail "5xx count should be 6 (request_error lines ignored)"
echo "$out" | grep 'container-health' | grep -q 'db is unhealthy' || fail "unhealthy db not named"
echo "$out" | grep 'container-health' | grep -q 'api restarted (0 -> 2)' || fail "restart increase not detected"
pass "all six alert types fire with the right detail"

echo "== 2b. failing 'compose logs' must not break the 5xx count (reproduced bug)"
healthy
for i in $(seq 1 6); do echo '{"level":"info","msg":"request","status":502}' >>"$T/api.log"; done
export FO_TEST_LOGS_FAIL=1
out="$("$INFRA/healthcheck.sh" --dry-run 2>&1)" || fail "healthcheck aborted when compose logs exited non-zero"
echo "$out" | grep -q 'integer expression' && fail "non-numeric 5xx count leaked: $out"
echo "$out" | grep -q 'ALERT OPEN    api-5xx: 6 API' || fail "5xx not counted from partial logs: $out"
: >"$T/api.log"
out="$("$INFRA/healthcheck.sh" --dry-run 2>&1)" || fail "healthcheck aborted on empty failing logs"
echo "$out" | grep -q 'ALERT.*api-5xx' && fail "empty logs raised a 5xx alert"
unset FO_TEST_LOGS_FAIL
pass "compose logs failure: partial output still counted, empty output is 0, no crash"

echo "== 2c. leftover <db>_old_* databases older than 14 days (low priority)"
healthy
stale_db="fo_old_$(date -u -d '20 days ago' +%Y%m%dt%H%M%Sz)"
fresh_db="fo_old_$(date -u -d '2 days ago' +%Y%m%dt%H%M%Sz)"
printf '%s\n%s\n' "$stale_db" "$fresh_db" >"$T/psql.out"
out="$(FO_TEST_PSQL_OUT="$T/psql.out" "$INFRA/healthcheck.sh" --dry-run 2>&1)"
echo "$out" | grep 'ALERT OPEN    old-database' | grep -q "$stale_db" || fail "stale old database not reported: $out"
echo "$out" | grep 'old-database' | grep -q "$fresh_db" && fail "fresh old database wrongly reported"
printf '%s\n' "$fresh_db" >"$T/psql.out"
out="$(FO_TEST_PSQL_OUT="$T/psql.out" "$INFRA/healthcheck.sh" --dry-run 2>&1)"
echo "$out" | grep -q 'old-database' && fail "alert for a database under 14 days old"
pass "old-database alert only for restore leftovers older than 14 days"

echo "== 3. real GitHub calls against a fake API: one issue per alert, no duplicates, auto-close"
python3 "$INFRA/tests/fake_github.py" $GHPORT "$T/gh.json" &
GHPID=$!
sleep 1
export FO_GH_API="http://127.0.0.1:$GHPORT" GH_MONITOR_TOKEN=testtoken GH_MONITOR_REPO=o/r
rm -rf "$T/state"
mkdir -p "$T/state"
healthy
export FO_TEST_DISK=95
"$INFRA/healthcheck.sh" >/dev/null 2>&1
"$INFRA/healthcheck.sh" >/dev/null 2>&1
"$INFRA/healthcheck.sh" >/dev/null 2>&1
n="$(jq '[.issues[] | select(.title == "[alert] disk-usage")] | length' "$T/gh.json")"
[ "$n" = 1 ] || fail "expected exactly one disk-usage issue, got $n"
[ "$(jq '.comments | length' "$T/gh.json")" = 0 ] || fail "repeat runs commented within the 6h window"
pass "3 runs while firing -> 1 issue, no comment spam"
jq -e '.files["heartbeats/healthcheck.json"]' "$T/gh.json" >/dev/null || fail "healthcheck heartbeat missing"
[ "$(jq '[.requests[] | select(.path == "/contents/heartbeats/healthcheck.json" and .method == "PUT")] | length' "$T/gh.json")" = 1 ] || fail "heartbeat should be sent once per day"
pass "healthcheck heartbeat sent once"
FO_ALERT_REPEAT_SECS=0 "$INFRA/healthcheck.sh" 2>&1 | tail -5
[ "$(jq '.comments | length' "$T/gh.json")" = 1 ] || fail "expected a repeat comment when window elapsed"
pass "repeat comment after the window"
export FO_TEST_DISK=40
"$INFRA/healthcheck.sh" >/dev/null 2>&1
st="$(jq -r '.issues[0].state' "$T/gh.json")"
[ "$st" = closed ] || fail "issue not closed when condition cleared"
jq -e '.comments[-1].body | test("cleared")' "$T/gh.json" >/dev/null || fail "no clearing comment"
pass "issue commented and closed when the condition cleared"
export FO_TEST_DISK=95
"$INFRA/healthcheck.sh" >/dev/null 2>&1
[ "$(jq '[.issues[] | select(.title == "[alert] disk-usage")] | length' "$T/gh.json")" = 2 ] || fail "recurrence should open a new issue"
pass "recurrence after close opens a fresh issue"

echo "== 3b. tracked issue closed by hand / deleted"
open_disk() { jq '[.issues[] | select(.title == "[alert] disk-usage" and .state == "open")] | length' "$T/gh.json"; }
[ "$(open_disk)" = 1 ] || fail "precondition: one open disk issue"
num="$(jq '[.issues[] | select(.title == "[alert] disk-usage" and .state == "open")][0].number' "$T/gh.json")"
curl -fsS "$FO_GH_API/__admin/close/$num" >/dev/null
"$INFRA/healthcheck.sh" >/dev/null 2>&1
[ "$(open_disk)" = 1 ] || fail "closed-by-hand issue was not replaced"
new="$(jq '[.issues[] | select(.title == "[alert] disk-usage" and .state == "open")][0].number' "$T/gh.json")"
[ "$new" != "$num" ] || fail "reused the closed issue number"
pass "issue closed manually -> a new issue is opened"
curl -fsS "$FO_GH_API/__admin/delete/$new" >/dev/null
"$INFRA/healthcheck.sh" >/dev/null 2>&1
[ "$(open_disk)" = 1 ] || fail "404 on the tracked issue was not recovered from"
pass "tracked issue deleted (404) -> state cleared and a new issue is opened"
cur="$(jq '[.issues[] | select(.title == "[alert] disk-usage" and .state == "open")][0].number' "$T/gh.json")"
curl -fsS "$FO_GH_API/__admin/close/$cur" >/dev/null
export FO_TEST_DISK=40
"$INFRA/healthcheck.sh" >/dev/null 2>&1 || fail "clearing an alert whose issue was closed by hand failed"
[ ! -f "$T/state/alerts/disk-usage.state" ] || fail "state kept after the issue was closed by hand"
pass "condition clears after a manual close without errors"

echo "== 3c. the token never appears in curl's argv"
cat >"$T/bin/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$@" >>"$FO_TEST_CURL_ARGS"
exec /usr/bin/curl "$@"
EOF
chmod +x "$T/bin/curl"
export FO_TEST_CURL_ARGS="$T/curl-args.txt"
: >"$FO_TEST_CURL_ARGS"
rm -f "$T/state/last-heartbeat"
export FO_TEST_DISK=95
"$INFRA/healthcheck.sh" >/dev/null 2>&1
[ -s "$FO_TEST_CURL_ARGS" ] || fail "curl shim recorded nothing"
grep -q testtoken "$FO_TEST_CURL_ARGS" && fail "token leaked into curl arguments"
pass "curl argv contains no token (header file used)"
rm -f "$T/bin/curl"

echo "== 4. reboot-when-idle"
healthy
printf '#!/usr/bin/env bash\necho "$FO_TEST_DRAFTS"\n' >"$T/active-drafts.sh"
chmod +x "$T/active-drafts.sh"
export FO_ACTIVE_DRAFTS_CMD="$T/active-drafts.sh"
export FO_REBOOT_CMD="touch $T/rebooted"
export FO_TEST_DRAFTS=0
"$INFRA/reboot-when-idle.sh" >/dev/null 2>&1
[ ! -e "$T/rebooted" ] || fail "rebooted with no flag"
touch "$T/reboot-required"
FO_TEST_DRAFTS=2 "$INFRA/reboot-when-idle.sh" >/dev/null 2>&1
[ ! -e "$T/rebooted" ] || fail "rebooted during an active draft"
FO_TEST_DRAFTS=0 "$INFRA/reboot-when-idle.sh" >/dev/null 2>&1
[ -e "$T/rebooted" ] || fail "did not reboot when idle"
pass "no flag -> nothing; flag + draft -> skip; flag + idle -> reboot"
rm -f "$T/rebooted"
touch "$T/reboot-required"
touch "$T/state/backup.lock" "$T/deploy.lock"
export FO_DEPLOY_LOCK="$T/deploy.lock"
flock "$T/state/backup.lock" sleep 4 & lp=$!
sleep 1
FO_TEST_DRAFTS=0 "$INFRA/reboot-when-idle.sh" >/dev/null 2>&1
[ ! -e "$T/rebooted" ] || fail "rebooted while a backup held its lock"
wait "$lp"
flock "$T/deploy.lock" sleep 4 & lp=$!
sleep 1
FO_TEST_DRAFTS=0 "$INFRA/reboot-when-idle.sh" >/dev/null 2>&1
[ ! -e "$T/rebooted" ] || fail "rebooted while a deploy held its lock"
wait "$lp"
FO_TEST_DRAFTS=0 "$INFRA/reboot-when-idle.sh" >/dev/null 2>&1
[ -e "$T/rebooted" ] || fail "did not reboot once the locks were free"
pass "backup lock or deploy lock held -> no reboot; free -> reboot"
rm -f "$T/rebooted"
touch -d '5 days ago' "$T/reboot-required"
FO_TEST_DRAFTS=1 "$INFRA/reboot-when-idle.sh" >/dev/null 2>&1
[ ! -e "$T/rebooted" ] || fail "rebooted during a draft"
jq -e '[.issues[] | select(.title == "[alert] reboot-pending" and .state == "open")] | length == 1' "$T/gh.json" >/dev/null || fail "stale reboot did not raise an issue"
pass "reboot pending > 3 days with a live draft raises the alert instead"
FO_TEST_DRAFTS=abc "$INFRA/reboot-when-idle.sh" >/dev/null 2>&1 && fail "non-numeric drafts should abort"
pass "garbage from active-drafts aborts without rebooting"
echo "ALL HEALTHCHECK CHECKS PASSED"
