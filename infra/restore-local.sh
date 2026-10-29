#!/usr/bin/env bash
# Decrypt a backup on the owner's laptop, so the age private key never leaves it.
#
#   infra/restore-local.sh [--host IP] [--ssh-key FILE] [--identity FILE]
#                          [--file daily/fo-scheduled-<stamp>.dump.age] [--output FILE]
#
# The server streams the encrypted object over SSH (as admin, running rclone as deploy);
# decryption happens here in a throwaway container. Without --output, the dump is restored
# into a throwaway postgres:18.6 container and row counts are printed (the quarterly test).
# With --output, the decrypted file is written there instead (for a production restore via
# `restore.sh --local-dump`, or to recover .env from config/). Needs only ssh and Docker;
# works with macOS's bash 3.2.
set -euo pipefail

HOST="${FO_HOST:-64.177.125.228}"
SSH_KEY="${FO_SSH_KEY:-$HOME/.ssh/fo_admin}"
IDENTITY="${FO_AGE_IDENTITY:-$HOME/.ssh/fo_backup_age.key}"
FILE=""
OUTPUT=""
PG_IMAGE="postgres:18.6"
AGE_IMAGE="alpine:3.22"
KEY_TABLES="app_user league season draft draft_pick draft_seat ceremony category_edition nomination film person"

while [ $# -gt 0 ]; do
  case "$1" in
    --host) HOST="${2:?}"; shift 2 ;;
    --ssh-key) SSH_KEY="${2:?}"; shift 2 ;;
    --identity) IDENTITY="${2:?}"; shift 2 ;;
    --file) FILE="${2:?}"; shift 2 ;;
    --output) OUTPUT="${2:?}"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -r "$IDENTITY" ] || { echo "age identity not readable: $IDENTITY" >&2; exit 1; }
case "$FILE" in *[!A-Za-z0-9._/-]*) echo "invalid --file" >&2; exit 2 ;; esac

remote() {
  # Runs as deploy on the server with the backup remote configured from .env.
  ssh -i "$SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes "admin@$HOST" \
    "sudo -u deploy bash -c 'cd /srv/fantasy-oscars && . infra/lib/ops.sh && fo_load_env && fo_setup_remote && $1' </dev/null"
}

if [ -z "$FILE" ]; then
  FILE="daily/$(remote 'rclone lsf "$FO_REMOTE_ROOT/daily" | sort | tail -1')"
  [ "$FILE" != "daily/" ] || { echo "no daily backups found" >&2; exit 1; }
fi
echo "backup: $FILE" >&2

work="$(mktemp -d)"
scratch="fo-local-restore-$$"
cleanup() {
  rm -rf "$work"
  docker rm -f "$scratch" >/dev/null 2>&1 || true
}
trap cleanup EXIT

remote "rclone cat \"\$FO_REMOTE_ROOT/$FILE\"" > "$work/backup.age"
echo "downloaded $(wc -c < "$work/backup.age" | tr -d ' ') bytes (encrypted)" >&2

decrypt() {
  docker run --rm -i -v "$IDENTITY:/key:ro" "$AGE_IMAGE" \
    sh -c 'apk add -q age >/dev/null 2>&1 && age -d -i /key' < "$work/backup.age"
}

if [ -n "$OUTPUT" ]; then
  (umask 077 && decrypt > "$OUTPUT")
  echo "decrypted to $OUTPUT ($(wc -c < "$OUTPUT" | tr -d ' ') bytes); delete it when done" >&2
  exit 0
fi

docker run -d --name "$scratch" -e POSTGRES_PASSWORD=scratch -e POSTGRES_USER=fantasy \
  -e POSTGRES_DB=fantasy_oscars "$PG_IMAGE" >/dev/null
i=0
until docker exec "$scratch" pg_isready -U fantasy -q 2>/dev/null; do
  i=$((i + 1)); [ "$i" -lt 60 ] || { echo "scratch postgres did not start" >&2; exit 1; }
  sleep 1
done
decrypt | docker exec -i "$scratch" pg_restore -U fantasy -d fantasy_oscars \
  --no-owner --no-privileges --single-transaction --exit-on-error
echo "decrypt and restore ok; row counts:"
for t in $KEY_TABLES; do
  printf '  %-18s %s\n' "$t" "$(docker exec "$scratch" psql -U fantasy -d fantasy_oscars -Atc "select count(*) from $t")"
done
