#!/usr/bin/env bash
# Start deploy.sh detached from the calling (SSH) session, so a dropped connection
# cannot kill a deploy halfway through a migration or rollback.
#
#   infra/deploy-detached.sh [--force] <tag>
#
# Prints two lines and returns immediately:
#   LOG=<path>      combined output of the deploy
#   STATUS=<path>   appears when the deploy has finished; contains its exit code
# deploy.sh keeps its own flock, so overlapping deploys are still refused.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FO_DIR="${FO_DIR:-/srv/fantasy-oscars}"
export FO_DIR

if [ "${1:-}" = "--child" ]; then
  shift
  trap '' HUP PIPE
  rc=0
  "$SCRIPT_DIR/deploy.sh" "$@" || rc=$?
  echo "$rc" >"$STATUS_FILE.tmp"
  mv "$STATUS_FILE.tmp" "$STATUS_FILE"
  exit 0
fi

[ $# -ge 1 ] || {
  echo "usage: deploy-detached.sh [--force] <tag>" >&2
  exit 1
}
tag="${*: -1}"
[[ "$tag" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || {
  echo "invalid tag: $tag" >&2
  exit 1
}

logs="$FO_DIR/logs"
mkdir -p "$logs"
find "$logs" -name 'deploy-*' -mtime +30 -delete 2>/dev/null || true

log="$logs/deploy-${tag}-$(date -u +%Y%m%dT%H%M%SZ).log"
status="${log%.log}.status"
: >"$log"

# Ignore HUP/PIPE, new session (when setsid exists), no tty; record the exit code last.
launch=("${BASH_SOURCE[0]}" --child "$@")
if command -v setsid >/dev/null 2>&1; then
  launch=(setsid "${launch[@]}")
fi
STATUS_FILE="$status" nohup "${launch[@]}" </dev/null >>"$log" 2>&1 &
disown

echo "LOG=$log"
echo "STATUS=$status"
