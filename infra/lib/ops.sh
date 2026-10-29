#!/usr/bin/env bash
# Shared helpers for the host-side ops scripts. Source this file; do not execute it.
# shellcheck shell=bash

FO_INSTALL_DIR="${FO_INSTALL_DIR:-/srv/fantasy-oscars}"
FO_ENV_FILE="${FO_ENV_FILE:-$FO_INSTALL_DIR/.env}"
FO_STATE_DIR="${FO_STATE_DIR:-/var/lib/fantasy-oscars}"
FO_COMPOSE_PROJECT="${FO_COMPOSE_PROJECT:-fantasy-oscars}"
FO_REMOTE_NAME="fobackup"

fo_log() { printf '%s [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${FO_TAG:-fo}" "$*" >&2; }
fo_die() {
  fo_log "ERROR: $*"
  exit 1
}

# Load KEY=VALUE pairs from the .env file without executing it.
# Values already present in the environment win (handy for tests and overrides).
fo_load_env() {
  local file="${1:-$FO_ENV_FILE}" line key value
  [ -r "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in '' | '#'*) continue ;; esac
    key="${line%%=*}"
    value="${line#*=}"
    case "$key" in *[!A-Za-z0-9_]* | '') continue ;; esac
    case "$value" in
      \"*\")
        value="${value#\"}"
        value="${value%\"}"
        ;;
      \'*\')
        value="${value#\'}"
        value="${value%\'}"
        ;;
    esac
    if [ -z "${!key+x}" ]; then
      export "$key=$value"
    fi
  done <"$file"
}

fo_require() {
  local name
  for name in "$@"; do
    [ -n "${!name:-}" ] || fo_die "missing required setting: $name (set it in $FO_ENV_FILE)"
  done
}

# Compose wrapper, same invocation as the runtime package's deploy.sh. Tests can replace it by
# exporting FO_COMPOSE_CMD.
fo_compose() {
  if [ -n "${FO_COMPOSE_CMD:-}" ]; then
    local cmd
    read -ra cmd <<<"$FO_COMPOSE_CMD"
    "${cmd[@]}" "$@"
    return
  fi
  local args=(docker compose -p "$FO_COMPOSE_PROJECT" --project-directory "$FO_INSTALL_DIR"
    -f "$FO_INSTALL_DIR/compose.yaml" --env-file "$FO_INSTALL_DIR/.env")
  if [ -f "$FO_INSTALL_DIR/.env-deploy" ]; then
    args+=(--env-file "$FO_INSTALL_DIR/.env-deploy")
  fi
  "${args[@]}" "$@"
}

# fo_lock_held FILE -> success when another process holds an flock on FILE (never creates it).
fo_lock_held() {
  [ -e "$1" ] || return 1
  ! (flock -n 8) 8<"$1"
}

# Build the rclone remote from .env settings (env-var config, no rclone.conf on disk).
# A test or advanced setup can pre-set RCLONE_CONFIG_FOBACKUP_TYPE to bypass this.
fo_setup_remote() {
  if [ -z "${RCLONE_CONFIG_FOBACKUP_TYPE:-}" ]; then
    fo_require BACKUP_S3_ENDPOINT BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY BACKUP_BUCKET
    export RCLONE_CONFIG_FOBACKUP_TYPE=s3
    export RCLONE_CONFIG_FOBACKUP_PROVIDER="${BACKUP_S3_PROVIDER:-Other}"
    export RCLONE_CONFIG_FOBACKUP_ENDPOINT="$BACKUP_S3_ENDPOINT"
    export RCLONE_CONFIG_FOBACKUP_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID"
    export RCLONE_CONFIG_FOBACKUP_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY"
    export RCLONE_CONFIG_FOBACKUP_REGION="${BACKUP_S3_REGION:-auto}"
    # Bucket-scoped keys cannot create/list buckets; never try.
    export RCLONE_CONFIG_FOBACKUP_NO_CHECK_BUCKET=true
  fi
  export RCLONE_CONFIG="${RCLONE_CONFIG:-/dev/null}"
  FO_REMOTE_ROOT="$FO_REMOTE_NAME:${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
}

# Number of IN_PROGRESS drafts (provided by the runtime package).
fo_active_drafts() {
  local ad="${FO_ACTIVE_DRAFTS_CMD:-$FO_INSTALL_DIR/infra/lib/active-drafts.sh}"
  "$ad"
}

fo_utc_stamp() { date -u +%Y%m%dT%H%M%SZ; }

# Epoch of a file's mtime (GNU stat first, BSD fallback for dev machines).
fo_mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1"; }

# Run pg_dump (custom format) inside the db container; credentials come from the container env.
fo_pg_dump() {
  fo_compose exec -T db sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner'
}

# Key tables whose row counts are compared after a restore (names from database/migrations).
FO_KEY_TABLES="app_user league season draft draft_pick draft_seat ceremony category_edition nomination film person"

# fo_row_counts TARGET -> "table count" lines. TARGET is "compose-db" (the production db
# service) or the name of any postgres container whose env has POSTGRES_USER/POSTGRES_DB.
fo_row_counts() {
  local target="$1" t sql=""
  for t in $FO_KEY_TABLES; do
    sql+="SELECT '$t', count(*) FROM public.$t UNION ALL "
  done
  sql="${sql% UNION ALL }"
  local run='exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F " " -c "$1"'
  if [ "$target" = compose-db ]; then
    fo_compose exec -T db sh -c "$run" sh "$sql"
  else
    docker exec "$target" sh -c "$run" sh "$sql"
  fi
}
