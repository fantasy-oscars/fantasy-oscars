#!/usr/bin/env bash
# Monthly automated backup verification (runs on the server, which has no private key).
#
# 1. fresh pg_dump -> restore into a scratch postgres:18 container -> compare row counts
#    with production (small drift from live writes is tolerated; see FO_VERIFY_TOLERANCE_PCT);
# 2. age-encrypt the dump, upload to verify/, download it back, compare sha256 of the ciphertext.
# Decryption itself cannot be verified here; the owner's test restore does that (runbook).
# On success writes the restore-verify heartbeat.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FO_TAG=verify-restore
# shellcheck source=lib/ops.sh
. "$SCRIPT_DIR/lib/ops.sh"
# shellcheck source=lib/github.sh
. "$SCRIPT_DIR/lib/github.sh"
# shellcheck source=lib/scratch.sh
. "$SCRIPT_DIR/lib/scratch.sh"

fo_load_env
fo_require BACKUP_AGE_RECIPIENT
fo_setup_remote
TOL="${FO_VERIFY_TOLERANCE_PCT:-1}"

mkdir -p "$FO_STATE_DIR"
chmod 700 "$FO_STATE_DIR"
exec 9>"$FO_STATE_DIR/verify.lock"
flock -n 9 || fo_die "another verification is running"
# We hold the lock, so any older work dir is a leftover from a crashed run.
find "$FO_STATE_DIR" -maxdepth 1 -type d -name 'verify.*' -mmin +120 -exec rm -rf {} + 2>/dev/null || true
WORK="$(mktemp -d "$FO_STATE_DIR/verify.XXXXXX")"
chmod 700 "$WORK"
REMOTE_OBJ=""
cleanup() {
  scratch_stop
  [ -n "$REMOTE_OBJ" ] && rclone deletefile "$REMOTE_OBJ" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

fo_log "taking fresh dump"
(
  umask 077
  fo_pg_dump >"$WORK/dump"
)
[ "$(head -c 5 "$WORK/dump")" = "PGDMP" ] || fo_die "dump is not a pg_dump archive"

before="$(fo_row_counts compose-db)"
scratch_start
scratch_restore "$WORK/dump"
restored="$(fo_row_counts "$FO_SCRATCH_NAME")"
after="$(fo_row_counts compose-db)"

fail=0
while read -r table restored_n; do
  before_n="$(awk -v t="$table" '$1 == t {print $2}' <<<"$before")"
  after_n="$(awk -v t="$table" '$1 == t {print $2}' <<<"$after")"
  # restored must lie within [before, after] widened by the tolerance (writes during the dump).
  lo=$((before_n < after_n ? before_n : after_n))
  hi=$((before_n > after_n ? before_n : after_n))
  slack=$((hi * TOL / 100))
  if [ "$restored_n" -lt $((lo - slack)) ] || [ "$restored_n" -gt $((hi + slack)) ]; then
    fo_log "MISMATCH $table: production $before_n..$after_n, restored $restored_n"
    fail=1
  else
    fo_log "ok $table: production $before_n..$after_n, restored $restored_n"
  fi
done <<<"$restored"
[ "$fail" = 0 ] || fo_die "row counts differ between production and the restored copy"

fo_log "checking ciphertext round trip"
age -r "$BACKUP_AGE_RECIPIENT" -o "$WORK/dump.age" "$WORK/dump"
REMOTE_OBJ="$FO_REMOTE_ROOT/verify/fo-verify-$(fo_utc_stamp).dump.age"
rclone copyto "$WORK/dump.age" "$REMOTE_OBJ"
rclone copyto "$REMOTE_OBJ" "$WORK/dump.age.down"
a="$(sha256sum "$WORK/dump.age" | cut -d' ' -f1)"
b="$(sha256sum "$WORK/dump.age.down" | cut -d' ' -f1)"
[ "$a" = "$b" ] || fo_die "ciphertext checksum differs after upload/download"

fo_log "verification ok"
if [ -n "${GH_MONITOR_TOKEN:-}" ]; then
  gh_heartbeat restore-verify "row counts and ciphertext checksum ok" ||
    fo_log "WARNING: heartbeat failed"
fi
