#!/usr/bin/env bash
# Backup -> restore round trip against a throwaway postgres:18.6 container.
# Needs: docker (socket), age, rclone, jq, python3, GNU coreutils. Run via run-in-container.sh.
# Uses only containers named fo-ops-*, and removes what it creates.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INFRA="$ROOT/infra"
T="$(mktemp -d)"
PG=fo-ops-pg-$$
GHPORT=18765
export FO_TEST_DB_CONTAINER="$PG"
export FO_TEST_COMPOSE_LOG="$T/compose.log"
count() { find "$1" -type f | wc -l | tr -d " "; }
has() { compgen -G "$1" >/dev/null; }
pass() { echo "PASS $*"; }
fail() {
  echo "FAIL $*"
  exit 1
}
cleanup() {
  docker rm -f -v "$PG" >/dev/null 2>&1 || true
  [ -n "${GHPID:-}" ] && kill "$GHPID" 2>/dev/null || true
  rm -rf "$T"
}
trap cleanup EXIT
psql_fo() { docker exec "$PG" psql -U fo -d "${DB:-fo}" -v ON_ERROR_STOP=1 -At "$@"; }

echo "== start postgres and apply migrations"
docker run -d --name "$PG" -e POSTGRES_USER=fo -e POSTGRES_PASSWORD=x -e POSTGRES_DB=fo postgres:18.6 >/dev/null
for _ in $(seq 1 60); do
  docker exec "$PG" pg_isready -U fo -d fo >/dev/null 2>&1 && sleep 2 && docker exec "$PG" pg_isready -U fo -d fo >/dev/null 2>&1 && break
  sleep 1
done
for f in "$ROOT"/database/migrations/*.sql; do
  docker exec -i "$PG" psql -U fo -d fo -v ON_ERROR_STOP=1 -q <"$f" >/dev/null
done
psql_fo -q -c \
  "INSERT INTO app_user (username,email) SELECT 'u'||g, 'u'||g||'@example.com' FROM generate_series(1,7) g;
   INSERT INTO ceremony (code,name,year) VALUES ('c1','One',2025),('c2','Two',2026);" >/dev/null
pass "migrations applied and seeded"

export FO_COMPOSE_CMD="$INFRA/tests/fake-compose.sh"
export FO_STATE_DIR="$T/state"
export FO_ENV_FILE="$T/env"
export RCLONE_CONFIG_FOBACKUP_TYPE=local
export BACKUP_BUCKET="$T/remote"
mkdir -p "$BACKUP_BUCKET"
printf '#!/usr/bin/env bash\necho "${FO_TEST_DRAFTS:-0}"\n' >"$T/active-drafts.sh"
chmod +x "$T/active-drafts.sh"
export FO_ACTIVE_DRAFTS_CMD="$T/active-drafts.sh"
age-keygen -o "$T/key.txt" 2>/dev/null
RECIP="$(age-keygen -y "$T/key.txt")"
age-keygen -o "$T/wrongkey.txt" 2>/dev/null
printf 'BACKUP_AGE_RECIPIENT=%s\nSECRET_THING=abc\n' "$RECIP" >"$T/env"

echo "== fake GitHub for heartbeats and alerts"
python3 "$INFRA/tests/fake_github.py" $GHPORT "$T/gh.json" &
GHPID=$!
sleep 1
export FO_GH_API="http://127.0.0.1:$GHPORT" GH_MONITOR_TOKEN=testtoken GH_MONITOR_REPO=o/r
hb_puts() { jq '[.requests[] | select(.path == "/contents/heartbeats/backup.json" and .method == "PUT")] | length' "$T/gh.json"; }

echo "== retention: seed old backups, run one scheduled backup"
mkdir -p "$BACKUP_BUCKET/daily" "$BACKUP_BUCKET/pre-deploy"
for i in $(seq 1 20); do
  : >"$BACKUP_BUCKET/daily/fo-scheduled-202001$(printf '%02d' "$i")T030000Z.dump.age"
done
for i in $(seq 1 12); do
  : >"$BACKUP_BUCKET/pre-deploy/fo-pre-deploy-202001$(printf '%02d' "$i")T030000Z.dump.age"
done
# a crashed earlier run left a work dir behind
mkdir -p "$FO_STATE_DIR/backup.STALE" "$FO_STATE_DIR/backup.FRESH"
touch -d '3 hours ago' "$FO_STATE_DIR/backup.STALE"
"$INFRA/backup.sh" --reason scheduled
[ "$(count "$BACKUP_BUCKET/daily")" -eq 14 ] || fail "daily retention is not 14 ($(count "$BACKUP_BUCKET/daily"))"
pass "daily retention keeps 14"
[ ! -d "$FO_STATE_DIR/backup.STALE" ] || fail "stale work dir not swept"
[ -d "$FO_STATE_DIR/backup.FRESH" ] || fail "fresh work dir wrongly swept"
pass "stale backup.* work dir swept, recent one kept"
[ "$(hb_puts)" = 1 ] || fail "scheduled backup should write one heartbeat"
"$INFRA/backup.sh" --reason pre-deploy
[ "$(count "$BACKUP_BUCKET/pre-deploy")" -eq 10 ] || fail "pre-deploy retention is not 10"
pass "pre-deploy retention keeps 10"
[ "$(hb_puts)" = 1 ] || fail "pre-deploy must not write the backup heartbeat"
pass "heartbeat written for scheduled runs only"
if grep -rl "PGDMP" "$BACKUP_BUCKET" 2>/dev/null | grep -q .; then fail "plaintext dump found on remote"; fi
pass "remote contains ciphertext only"

echo "== housekeeping failure after a good upload still records the backup"
mkdir -p "$T/shim"
cat >"$T/shim/rclone" <<'EOF'
#!/usr/bin/env bash
if [ "$1" = deletefile ]; then echo "simulated delete failure" >&2; exit 1; fi
exec /usr/bin/rclone "$@"
EOF
chmod +x "$T/shim/rclone"
before_hb="$(hb_puts)"
rm -f "$FO_STATE_DIR/last-backup"
sleep 1
rc=0
PATH="$T/shim:$PATH" "$INFRA/backup.sh" --reason scheduled || rc=$?
[ "$rc" -ne 0 ] || fail "prune failure should exit non-zero"
[ -s "$FO_STATE_DIR/last-backup" ] || fail "last-backup not recorded after prune failure"
[ "$(hb_puts)" = $((before_hb + 1)) ] || fail "heartbeat not written after prune failure"
jq -e '[.issues[] | select(.title == "[alert] backup-retention" and .state == "open")] | length == 1' "$T/gh.json" >/dev/null || fail "no backup-retention alert"
pass "prune failure: backup + heartbeat recorded, separate alert raised, non-zero exit"
sleep 1
"$INFRA/backup.sh" --reason scheduled
jq -e '[.issues[] | select(.title == "[alert] backup-retention" and .state == "open")] | length == 0' "$T/gh.json" >/dev/null || fail "retention alert not cleared"
[ "$(count "$BACKUP_BUCKET/daily")" -eq 14 ] || fail "retention not restored to 14"
pass "retention alert clears once housekeeping succeeds"

echo "== Sunday weekly copy and encrypted .env (forced via fake date)"
mkdir -p "$T/bin"
cat >"$T/bin/date" <<'EOF'
#!/usr/bin/env bash
if [ "$*" = "-u +%u" ]; then echo 7; else exec /usr/bin/date "$@"; fi
EOF
chmod +x "$T/bin/date"
sleep 1
PATH="$T/bin:$PATH" "$INFRA/backup.sh" --reason scheduled --no-heartbeat
has "$BACKUP_BUCKET/weekly/fo-weekly-*" || fail "weekly copy missing"
has "$BACKUP_BUCKET/config/fo-env-*" || fail "config backup missing"
age -d -i "$T/key.txt" "$BACKUP_BUCKET/config/"fo-env-* | grep -q SECRET_THING || fail "env backup does not decrypt"
pass "weekly copy + encrypted .env decrypts with the private key"

echo "== list and scratch restore"
lst="$("$INFRA/restore.sh" list)"
echo "$lst" | grep -q "== daily" || fail "list"
src="$(psql_fo -c "select count(*) from app_user")"
out="$("$INFRA/restore.sh" restore --identity "$T/key.txt")"
echo "$out"
echo "$out" | awk '/scratch restore/{f=1;next} /production now/{f=0} f' | grep -qx "app_user $src" || fail "scratch app_user count != $src"
echo "$out" | awk '/scratch restore/{f=1;next} /production now/{f=0} f' | grep -qx "ceremony 2" || fail "scratch ceremony count"
pass "scratch restore row counts match (app_user=$src ceremony=2)"
docker ps -a --format '{{.Names}}' | grep -q '^fo-ops-scratch-' && fail "scratch container left behind"
pass "scratch container cleaned up"

echo "== wrong key and guard rails"
if "$INFRA/restore.sh" restore --identity "$T/wrongkey.txt" >/dev/null 2>&1; then fail "wrong key accepted"; fi
pass "wrong key rejected"
if "$INFRA/restore.sh" restore --identity "$T/key.txt" --into-production >/dev/null 2>&1; then fail "prod restore without --i-understand"; fi
pass "--into-production requires --i-understand"

echo "== production restore: dump predates a later table; data damaged since"
psql_fo -q -c "create table extra_later(id int); insert into extra_later values (1),(2); delete from app_user; delete from ceremony;" >/dev/null
: >"$FO_TEST_COMPOSE_LOG"
rc=0
FO_TEST_DRAFTS=2 "$INFRA/restore.sh" restore --identity "$T/key.txt" --into-production --i-understand >"$T/p.out" 2>&1 || rc=$?
[ "$rc" -ne 0 ] || fail "restore ran while drafts were active"
grep -q "draft(s) are in progress" "$T/p.out" || fail "no active-draft message"
[ ! -s "$FO_TEST_COMPOSE_LOG" ] || fail "api was stopped despite the refusal"
[ "$(psql_fo -c 'select count(*) from extra_later')" = 2 ] || fail "database touched by a refused restore"
pass "refused while drafts are active (nothing stopped, nothing changed)"

touch "$T/deploy.lock"
export FO_DEPLOY_LOCK="$T/deploy.lock"
flock "$T/deploy.lock" sleep 8 &
LOCKPID=$!
sleep 1
rc=0
"$INFRA/restore.sh" restore --identity "$T/key.txt" --into-production --i-understand >"$T/p.out" 2>&1 || rc=$?
[ "$rc" -ne 0 ] || fail "restore ran while a deploy held its lock"
grep -q "a deploy is running" "$T/p.out" || fail "no clear message for the held deploy lock"
[ ! -s "$FO_TEST_COMPOSE_LOG" ] || fail "api stopped despite the held deploy lock"
wait "$LOCKPID"
pass "refused with a clear message while a deploy holds its lock"

"$INFRA/restore.sh" restore --identity "$T/key.txt" --into-production --i-understand >"$T/p.out" 2>&1 || {
  cat "$T/p.out"
  fail "production restore failed"
}
[ "$(psql_fo -c 'select count(*) from app_user')" = "$src" ] || fail "app_user not restored"
[ "$(psql_fo -c "select coalesce(to_regclass('public.extra_later')::text,'gone')")" = gone ] || fail "table added after the dump survived the restore"
pass "restored; the later table is gone (nothing from the live database survives)"
has "$BACKUP_BUCKET/pre-restore/fo-pre-restore-*" || fail "pre-restore safety dump missing"
pass "pre-restore safety dump kept"
grep -q '^stop api' "$FO_TEST_COMPOSE_LOG" || fail "api not stopped"
grep -q '^start api' "$FO_TEST_COMPOSE_LOG" || fail "api not started"
pass "api stopped before and started after"
old="$(docker exec "$PG" psql -U fo -d postgres -At -c "select datname from pg_database where datname like 'fo_old_%'")"
[ -n "$old" ] || fail "previous database not kept"
DB="$old" psql_fo -c 'select count(*) from extra_later' >/dev/null 2>&1 && fail "old db should refuse connections"
docker exec "$PG" psql -U fo -d postgres -At -c "select datname from pg_database where datname = 'fo_restore'" | grep -q . && fail "restore database left behind"
pass "previous database kept as $old (connections disabled); no _restore leftovers"

echo "== production restore: failure mid-restore leaves production untouched and api running"
docker exec "$PG" pg_dump -U fo -d fo -Fc --no-owner >"$T/good.dump"
head -c 4000 "$T/good.dump" >"$T/bad.dump"
psql_fo -q -c "create table extra_later(id int); insert into extra_later values (9);" >/dev/null
: >"$FO_TEST_COMPOSE_LOG"
rc=0
"$INFRA/restore.sh" restore --local-dump "$T/bad.dump" --into-production --i-understand >"$T/p.out" 2>&1 || rc=$?
[ "$rc" -ne 0 ] || fail "truncated dump restored"
[ "$(psql_fo -c 'select count(*) from extra_later')" = 1 ] || fail "production changed by a failed restore"
[ "$(psql_fo -c 'select count(*) from app_user')" = "$src" ] || fail "production app_user changed by failed restore"
docker exec "$PG" psql -U fo -d postgres -At -c "select datname from pg_database where datname = 'fo_restore'" | grep -q . && fail "unfinished restore database not dropped"
tail -n 1 "$FO_TEST_COMPOSE_LOG" | grep -q '^start api' || fail "api not restarted after failure"
pass "failed restore: production intact, scratch DB dropped, api restarted"

echo "== local-dump restore (cutover path)"
"$INFRA/restore.sh" restore --local-dump "$T/good.dump" --into-production --i-understand --force >"$T/p.out" 2>&1 || {
  cat "$T/p.out"
  fail "local dump restore failed"
}
[ "$(psql_fo -c "select coalesce(to_regclass('public.extra_later')::text,'gone')")" = gone ] || fail "extra table survived local-dump restore"
pass "local dump restored through the same all-or-nothing procedure"

echo "== monthly verify-restore"
"$INFRA/verify-restore.sh" 2>&1 | tail -n 5
jq -e '.files["heartbeats/restore-verify.json"]' "$T/gh.json" >/dev/null || fail "restore-verify heartbeat missing"
[ ! -d "$BACKUP_BUCKET/verify" ] || [ "$(count "$BACKUP_BUCKET/verify")" -eq 0 ] || fail "verify object not cleaned"
pass "verify-restore ok with heartbeat"
echo "ALL ROUNDTRIP CHECKS PASSED"
