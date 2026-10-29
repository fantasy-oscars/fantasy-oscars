#!/usr/bin/env bash
# Encrypted offsite database backup.
#
#   infra/backup.sh [--reason scheduled|hourly|pre-deploy|pre-restore] [--no-heartbeat]
#
# pg_dump -Fc (inside the db container) -> age (public recipient only; the private key never
# lives on this host) -> rclone to the S3-compatible remote.
# Layout:  daily/ (keep 14)  weekly/ (keep 8, Sunday copy)  hourly/ (keep 48, awards season)
#          pre-deploy/ (keep 10)  pre-restore/ (keep 5)  config/ (encrypted .env, keep 8, weekly)
# Only scheduled (nightly) runs write the "backup" heartbeat. Once the upload is verified the
# backup counts as done: weekly copy / retention failures are reported through the
# backup-retention alert and a non-zero exit, but never withhold last-backup or the heartbeat.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FO_TAG=backup
# shellcheck source=lib/ops.sh
. "$SCRIPT_DIR/lib/ops.sh"
# shellcheck source=lib/github.sh
. "$SCRIPT_DIR/lib/github.sh"
# shellcheck source=lib/alerts.sh
. "$SCRIPT_DIR/lib/alerts.sh"

REASON=scheduled
NO_HEARTBEAT=0
while [ $# -gt 0 ]; do
  case "$1" in
    --reason)
      REASON="${2:?--reason needs a value}"
      shift 2
      ;;
    --no-heartbeat)
      NO_HEARTBEAT=1
      shift
      ;;
    -h | --help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *) fo_die "unknown argument: $1" ;;
  esac
done

HEARTBEAT=0
case "$REASON" in
  scheduled)
    PREFIX=daily
    KEEP=14
    HEARTBEAT=1
    ;;
  hourly)
    PREFIX=hourly
    KEEP=48
    ;;
  pre-deploy)
    PREFIX=pre-deploy
    KEEP=10
    ;;
  pre-restore)
    PREFIX=pre-restore
    KEEP=5
    ;;
  *) fo_die "unknown reason: $REASON" ;;
esac
[ "$NO_HEARTBEAT" = 0 ] || HEARTBEAT=0
WEEKLY_KEEP=8
CONFIG_KEEP=8

fo_load_env
fo_require BACKUP_AGE_RECIPIENT
fo_setup_remote

mkdir -p "$FO_STATE_DIR"
chmod 700 "$FO_STATE_DIR"
exec 9>"$FO_STATE_DIR/backup.lock"
flock -w 900 9 || fo_die "another backup is still running"

# We hold the lock, so any older work dir is a leftover from a crashed run.
find "$FO_STATE_DIR" -maxdepth 1 -type d -name 'backup.*' -mmin +120 -exec rm -rf {} + 2>/dev/null || true

WORK="$(mktemp -d "$FO_STATE_DIR/backup.XXXXXX")"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT

STAMP="$(fo_utc_stamp)"
PLAIN="$WORK/dump"
NAME="fo-$REASON-$STAMP.dump.age"

fo_log "dumping database ($REASON)"
(
  umask 077
  fo_pg_dump >"$PLAIN"
)
[ "$(head -c 5 "$PLAIN")" = "PGDMP" ] || fo_die "dump is not a pg_dump custom-format archive"
size="$(wc -c <"$PLAIN" | tr -d ' ')"
[ "$size" -gt 1024 ] || fo_die "dump suspiciously small ($size bytes)"

age -r "$BACKUP_AGE_RECIPIENT" -o "$WORK/$NAME" "$PLAIN"
rm -f "$PLAIN"
sum="$(sha256sum "$WORK/$NAME" | cut -d' ' -f1)"

fo_log "uploading $PREFIX/$NAME"
rclone copyto "$WORK/$NAME" "$FO_REMOTE_ROOT/$PREFIX/$NAME" --checksum
remote_size="$(rclone size --json "$FO_REMOTE_ROOT/$PREFIX/$NAME" | jq -r .bytes)"
local_size="$(wc -c <"$WORK/$NAME" | tr -d ' ')"
[ "$remote_size" = "$local_size" ] || fo_die "uploaded size $remote_size != local $local_size"

# From here on the backup exists and is verified: record it before any housekeeping.
echo "$STAMP $sum $PREFIX/$NAME" >"$FO_STATE_DIR/last-backup"
fo_log "ok: $PREFIX/$NAME ($local_size bytes, sha256 $sum)"
if [ "$HEARTBEAT" = 1 ] && [ -n "${GH_MONITOR_TOKEN:-}" ]; then
  gh_heartbeat backup "$PREFIX/$NAME" || fo_log "WARNING: heartbeat failed (backup itself succeeded)"
fi

# prune PREFIX KEEP PATTERN: delete everything but the newest KEEP matching files.
prune() {
  local prefix="$1" keep="$2" pattern="$3" listing old f
  listing="$(rclone lsf --files-only "$FO_REMOTE_ROOT/$prefix")" || return 1
  old="$(printf '%s\n' "$listing" | { grep -E "$pattern" || true; } | sort | awk -v k="$keep" '{a[NR]=$0} END{for(i=1;i<=NR-k;i++)print a[i]}')"
  [ -n "$old" ] || return 0
  while IFS= read -r f; do
    fo_log "pruning $prefix/$f"
    rclone deletefile "$FO_REMOTE_ROOT/$prefix/$f" || return 1
  done <<<"$old"
}
DUMP_PATTERN='^fo-[a-z-]+-[0-9]{8}T[0-9]{6}Z\.dump\.age$'

POST_FAILED=""
post_step() {
  local label="$1"
  shift
  if ! "$@"; then
    fo_log "ERROR: $label failed (the backup itself is safe)"
    POST_FAILED+="$label; "
  fi
}

weekly_steps() {
  rclone copyto "$FO_REMOTE_ROOT/$PREFIX/$NAME" "$FO_REMOTE_ROOT/weekly/fo-weekly-$STAMP.dump.age" || return 1
  prune weekly "$WEEKLY_KEEP" "$DUMP_PATTERN" || return 1
}
config_steps() {
  if [ ! -r "$FO_ENV_FILE" ]; then
    fo_log "WARNING: $FO_ENV_FILE not readable; skipped config backup"
    return 0
  fi
  age -r "$BACKUP_AGE_RECIPIENT" -o "$WORK/env.age" "$FO_ENV_FILE" || return 1
  rclone copyto "$WORK/env.age" "$FO_REMOTE_ROOT/config/fo-env-$STAMP.env.age" || return 1
  prune config "$CONFIG_KEEP" '^fo-env-[0-9]{8}T[0-9]{6}Z\.env\.age$' || return 1
}

if [ "$REASON" = scheduled ] && [ "$(date -u +%u)" = 7 ]; then
  fo_log "Sunday: copying to weekly/"
  post_step "weekly copy and retention" weekly_steps
  post_step "encrypted .env backup" config_steps
fi
post_step "$PREFIX retention" prune "$PREFIX" "$KEEP" "$DUMP_PATTERN"

if [ -n "${GH_MONITOR_TOKEN:-}" ] && [ -n "${GH_MONITOR_REPO:-}" ]; then
  if [ -n "$POST_FAILED" ]; then
    alert_set backup-retention firing "Backup $PREFIX/$NAME was uploaded, but these steps failed: ${POST_FAILED}Old backups may be piling up or the weekly copy is missing. See the backup journal (journalctl -u fo-backup.service)."
  elif [ "$REASON" = scheduled ]; then
    alert_set backup-retention clear
  fi
fi
[ -z "$POST_FAILED" ] || exit 1
