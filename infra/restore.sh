#!/usr/bin/env bash
# Restore tooling for the encrypted offsite backups.
#
#   infra/restore.sh list
#   infra/restore.sh restore --identity KEYFILE [--from daily|weekly|hourly|pre-deploy|pre-restore]
#                            [--file daily/fo-...dump.age] [--keep-scratch]
#   infra/restore.sh restore --identity KEYFILE ... --into-production --i-understand [--force]
#   infra/restore.sh restore --local-dump FILE.dump --into-production --i-understand [--force]
#
# KEYFILE is the age private key (identity) file. It is passed per run and never stored here;
# the owner keeps it in a password manager. Default target is a throwaway postgres container,
# followed by row counts for comparison.
#
# --into-production is all-or-nothing: refuses while drafts are in progress (unless --force),
# takes a pre-restore safety dump (kept), stops the api, restores into a FRESH database with
# --single-transaction, then swaps names (old database kept as <db>_old_<stamp>) so nothing
# from the live database survives. The api is restarted on any outcome. --local-dump restores
# a plaintext pg_dump -Fc file instead of an encrypted backup (used for the Render cutover).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FO_TAG=restore
# shellcheck source=lib/ops.sh
. "$SCRIPT_DIR/lib/ops.sh"
# shellcheck source=lib/scratch.sh
. "$SCRIPT_DIR/lib/scratch.sh"

usage() {
  sed -n '2,19p' "$0"
  exit "${1:-0}"
}

[ $# -ge 1 ] || usage 2
CMD="$1"
shift

IDENTITY=""
FROM=daily
FILE=""
LOCAL_DUMP=""
KEEP_SCRATCH=0
INTO_PROD=0
UNDERSTAND=0
FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --identity)
      IDENTITY="${2:?--identity needs a file}"
      shift 2
      ;;
    --from)
      FROM="${2:?--from needs a value}"
      shift 2
      ;;
    --file)
      FILE="${2:?--file needs a value}"
      shift 2
      ;;
    --local-dump)
      LOCAL_DUMP="${2:?--local-dump needs a file}"
      shift 2
      ;;
    --keep-scratch)
      KEEP_SCRATCH=1
      shift
      ;;
    --into-production)
      INTO_PROD=1
      shift
      ;;
    --i-understand)
      UNDERSTAND=1
      shift
      ;;
    --force)
      FORCE=1
      shift
      ;;
    -h | --help) usage 0 ;;
    *) fo_die "unknown argument: $1" ;;
  esac
done

fo_load_env

list_backups() {
  local p
  for p in daily weekly hourly pre-deploy pre-restore config; do
    echo "== $p"
    rclone lsf --files-only "$FO_REMOTE_ROOT/$p" 2>/dev/null | sort || true
  done
}

if [ "$CMD" = list ]; then
  fo_setup_remote
  list_backups
  exit 0
fi
[ "$CMD" = restore ] || usage 2

if [ -n "$LOCAL_DUMP" ]; then
  [ -r "$LOCAL_DUMP" ] || fo_die "cannot read $LOCAL_DUMP"
else
  [ -n "$IDENTITY" ] || fo_die "--identity KEYFILE is required"
  [ -r "$IDENTITY" ] || fo_die "cannot read identity file: $IDENTITY"
  fo_setup_remote
fi
if [ "$INTO_PROD" = 1 ] && [ "$UNDERSTAND" != 1 ]; then
  fo_die "--into-production requires --i-understand (it replaces the live database)"
fi
if [ "$INTO_PROD" = 1 ] && [ "$FORCE" != 1 ]; then
  drafts="$(fo_active_drafts)" || fo_die "could not count active drafts; fix that or pass --force"
  case "$drafts" in '' | *[!0-9]*) fo_die "active-drafts returned '$drafts'; pass --force to override" ;; esac
  [ "$drafts" -eq 0 ] || fo_die "$drafts draft(s) are in progress; wait for them to finish or pass --force"
fi

WORK="$(mktemp -d)"
chmod 700 "$WORK"
API_STOPPED=0
RESTORE_DB_CREATED=0
SWAP_STARTED=0
cleanup() {
  local rc=$?
  if [ "$API_STOPPED" = 1 ]; then
    fo_log "starting api"
    fo_compose start api || fo_log "ERROR: could not start api; start it by hand"
  fi
  if [ "$SWAP_STARTED" = 1 ]; then
    # Whatever happened during the swap, the live database name must accept connections again.
    fo_compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "UPDATE pg_database SET datallowconn = true WHERE datname = '"'"'$POSTGRES_DB'"'"'"' >/dev/null 2>&1 || fo_log "ERROR: could not re-enable connections on the live database; see the recovery path in docs/runbooks/vps.md"
  fi
  if [ "$RESTORE_DB_CREATED" = 1 ]; then
    fo_log "dropping the unfinished restore database"
    fo_compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS \"${POSTGRES_DB}_restore\" WITH (FORCE)"' >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK"
  if [ "$KEEP_SCRATCH" = 1 ] && [ -n "$FO_SCRATCH_NAME" ]; then
    fo_log "scratch container left running: $FO_SCRATCH_NAME (remove with: docker rm -f -v $FO_SCRATCH_NAME)"
  else
    scratch_stop
  fi
  exit "$rc"
}
trap cleanup EXIT

if [ -n "$LOCAL_DUMP" ]; then
  cp "$LOCAL_DUMP" "$WORK/dump"
  FILE="(local file $LOCAL_DUMP)"
else
  if [ -z "$FILE" ]; then
    latest="$(rclone lsf --files-only "$FO_REMOTE_ROOT/$FROM" | sort | tail -n 1)"
    [ -n "$latest" ] || fo_die "no backups found under $FROM/"
    FILE="$FROM/$latest"
  fi
  fo_log "using $FILE"
  rclone copyto "$FO_REMOTE_ROOT/$FILE" "$WORK/dump.age"
  (
    umask 077
    age -d -i "$IDENTITY" -o "$WORK/dump" "$WORK/dump.age"
  )
  fo_log "decrypted ok"
fi
[ "$(head -c 5 "$WORK/dump")" = "PGDMP" ] || fo_die "restore source is not a pg_dump custom-format archive"

if [ "$INTO_PROD" = 1 ]; then
  # Block deploys for the whole restore; fail clearly if one is running.
  DEPLOY_LOCK="${FO_DEPLOY_LOCK:-$FO_INSTALL_DIR/.deploy.lock}"
  exec 8>>"$DEPLOY_LOCK"
  flock -n 8 || fo_die "a deploy is running (lock $DEPLOY_LOCK is held); wait for it to finish"
  fo_log "taking pre-restore safety dump of production (kept under pre-restore/)"
  "$SCRIPT_DIR/backup.sh" --reason pre-restore --no-heartbeat
  # The safety dump took and released the backup lock itself; hold it from here on so a
  # scheduled backup cannot run against a half-swapped database.
  mkdir -p "$FO_STATE_DIR"
  exec 7>>"$FO_STATE_DIR/backup.lock"
  flock -n 7 || fo_die "a backup is running (lock $FO_STATE_DIR/backup.lock is held); retry in a few minutes"
  OLD_SUFFIX="_old_$(fo_utc_stamp | tr '[:upper:]' '[:lower:]')"

  fo_log "stopping api"
  API_STOPPED=1
  fo_compose stop api

  fo_log "creating a fresh database"
  RESTORE_DB_CREATED=1
  fo_compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${POSTGRES_DB}_restore\" WITH (FORCE)" -c "CREATE DATABASE \"${POSTGRES_DB}_restore\""'

  fo_log "restoring into the fresh database (single transaction)"
  fo_compose exec -T db sh -c 'exec pg_restore -U "$POSTGRES_USER" -d "${POSTGRES_DB}_restore" --single-transaction --exit-on-error --no-owner' <"$WORK/dump"

  fo_log "swapping databases"
  SWAP_STARTED=1
  # Rename needs no other sessions on the live database; the api is stopped, stragglers are kicked.
  fo_compose exec -T db sh -c '
    set -e
    q() { psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -At "$@"; }
    q -c "UPDATE pg_database SET datallowconn = false WHERE datname = '"'"'$POSTGRES_DB'"'"'" >/dev/null
    q -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '"'"'$POSTGRES_DB'"'"' AND pid <> pg_backend_pid()" >/dev/null
    if ! q -c "ALTER DATABASE \"$POSTGRES_DB\" RENAME TO \"${POSTGRES_DB}$1\"" \
      -c "ALTER DATABASE \"${POSTGRES_DB}_restore\" RENAME TO \"$POSTGRES_DB\""; then
      # Put the original back if only the first rename went through.
      q -c "ALTER DATABASE \"${POSTGRES_DB}$1\" RENAME TO \"$POSTGRES_DB\"" >/dev/null 2>&1 || true
      q -c "UPDATE pg_database SET datallowconn = true WHERE datname = '"'"'$POSTGRES_DB'"'"'" >/dev/null || true
      exit 1
    fi
    q -c "UPDATE pg_database SET datallowconn = true WHERE datname = '"'"'$POSTGRES_DB'"'"'" >/dev/null
  ' sh "$OLD_SUFFIX"
  RESTORE_DB_CREATED=0

  echo "== row counts (production, after restore)"
  fo_row_counts compose-db
  fo_log "done. The previous database is kept as <db>$OLD_SUFFIX; drop it when satisfied:"
  fo_log "  docker compose exec -T db sh -c 'psql -U \"\$POSTGRES_USER\" -d postgres -c \"DROP DATABASE \\\"\${POSTGRES_DB}$OLD_SUFFIX\\\"\"'"
  exit 0
fi

scratch_start
scratch_restore "$WORK/dump"
echo "== row counts (scratch restore of $FILE)"
fo_row_counts "$FO_SCRATCH_NAME"
if prod="$(fo_row_counts compose-db 2>/dev/null)"; then
  echo "== row counts (production now, for comparison; newer writes legitimately differ)"
  echo "$prod"
fi
