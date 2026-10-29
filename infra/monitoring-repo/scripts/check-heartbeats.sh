#!/usr/bin/env bash
# Report which heartbeat files are stale.
#
#   scripts/check-heartbeats.sh [HEARTBEAT_DIR] [NOW_EPOCH]
#
# Limits: backup.json and healthcheck.json 26 h, restore-verify.json 35 days.
# A missing or unparseable file counts as stale. Prints one line per stale heartbeat
# ("name: reason") and exits 1 when any is stale, 0 when all are fresh.
set -euo pipefail

DIR="${1:-heartbeats}"
NOW="${2:-$(date +%s)}"

declare -A LIMIT_HOURS=(
  [backup]=26
  [healthcheck]=26
  [restore-verify]=$((35 * 24))
)

stale=0
for name in backup healthcheck restore-verify; do
  file="$DIR/$name.json"
  limit="${LIMIT_HOURS[$name]}"
  if [ ! -f "$file" ]; then
    echo "$name: no heartbeat file yet (limit ${limit}h)"
    stale=1
    continue
  fi
  ts="$(jq -r '.timestamp // empty' "$file" 2>/dev/null || true)"
  if ! epoch="$(jq -nr --arg t "$ts" '$t | fromdateiso8601' 2>/dev/null)" || [ -z "$epoch" ]; then
    echo "$name: unreadable timestamp '$ts'"
    stale=1
    continue
  fi
  age_hours=$(((NOW - epoch) / 3600))
  if [ "$age_hours" -gt "$limit" ]; then
    echo "$name: last heartbeat $ts is ${age_hours}h old (limit ${limit}h)"
    stale=1
  fi
done
exit "$stale"
