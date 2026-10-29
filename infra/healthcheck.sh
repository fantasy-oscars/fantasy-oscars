#!/usr/bin/env bash
# Host health checks, run every 10 minutes by a systemd timer.
#
#   infra/healthcheck.sh [--dry-run]
#
# Each alert type maps to ONE GitHub issue "[alert] <key>" (label "alert") in the monitoring
# repo: opened when the condition starts, commented on at most every 6 h while it persists,
# commented on and closed when it clears. --dry-run prints what would happen and never calls
# GitHub (counters under $FO_STATE_DIR are still updated).
# Alert keys: disk-usage, memory-pressure, container-health, tls-expiry, api-5xx, reboot-pending.
# Test hooks: FO_MEMINFO, FO_REBOOT_FLAG, FO_TLS_PEM_CMD, FO_COMPOSE_CMD, FO_STATE_DIR.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FO_TAG=healthcheck
# shellcheck source=lib/ops.sh
. "$SCRIPT_DIR/lib/ops.sh"
# shellcheck source=lib/github.sh
. "$SCRIPT_DIR/lib/github.sh"
# shellcheck source=lib/alerts.sh
. "$SCRIPT_DIR/lib/alerts.sh"

case "${1:-}" in
  --dry-run) export FO_DRYRUN=1 ;;
  '') ;;
  *) fo_die "usage: healthcheck.sh [--dry-run]" ;;
esac

fo_load_env
mkdir -p "$FO_STATE_DIR"
if ! gh_dry; then
  fo_require GH_MONITOR_TOKEN GH_MONITOR_REPO
  gh_ensure_label "$FO_ALERT_LABEL" d73a4a
  gh_ensure_label low-priority fbca04
fi

DISK_PCT="${FO_DISK_PCT:-80}"
MEM_MIN_PCT="${FO_MEM_MIN_PCT:-10}"
MEM_RUNS="${FO_MEM_RUNS:-3}"
SWAP_MAX_PCT="${FO_SWAP_MAX_PCT:-50}"
TLS_DAYS="${FO_TLS_DAYS:-14}"
API_5XX_MAX="${FO_API_5XX_MAX:-5}"
REBOOT_DAYS="${FO_REBOOT_DAYS:-3}"
OLD_DB_DAYS="${FO_OLD_DB_DAYS:-14}"
MEMINFO="${FO_MEMINFO:-/proc/meminfo}"
REBOOT_FLAG="${FO_REBOOT_FLAG:-/var/run/reboot-required}"

# resolve KEY DETAIL: DETAIL empty -> condition clear, otherwise firing.
resolve() {
  if [ -n "$2" ]; then alert_set "$1" firing "$2"; else alert_set "$1" clear; fi
}

disk_use_pct() { df -P "$1" | awk 'NR==2 {gsub("%", "", $5); print $5}'; }

check_disk() {
  local detail="" pct root
  pct="$(disk_use_pct /)"
  [ "$pct" -le "$DISK_PCT" ] || detail+="/ is ${pct}% full (limit ${DISK_PCT}%). "
  root="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || true)"
  if [ -n "$root" ] && [ -d "$root" ]; then
    pct="$(disk_use_pct "$root")"
    [ "$pct" -le "$DISK_PCT" ] || detail+="Docker data ($root) is ${pct}% full (limit ${DISK_PCT}%). "
  fi
  resolve disk-usage "$detail"
}

check_memory() {
  local total avail swap_total swap_free detail="" count_file="$FO_STATE_DIR/mem-low-count" count=0 swap_pct=0
  total="$(awk '/^MemTotal:/ {print $2}' "$MEMINFO")"
  avail="$(awk '/^MemAvailable:/ {print $2}' "$MEMINFO")"
  swap_total="$(awk '/^SwapTotal:/ {print $2}' "$MEMINFO")"
  swap_free="$(awk '/^SwapFree:/ {print $2}' "$MEMINFO")"
  [ -f "$count_file" ] && count="$(cat "$count_file")"
  if [ $((avail * 100 / total)) -lt "$MEM_MIN_PCT" ]; then
    count=$((count + 1))
  else
    count=0
  fi
  echo "$count" >"$count_file"
  if [ "$count" -ge "$MEM_RUNS" ]; then
    detail+="MemAvailable under ${MEM_MIN_PCT}% for $count consecutive runs ($((avail / 1024)) MiB of $((total / 1024)) MiB). "
  fi
  if [ "${swap_total:-0}" -gt 0 ]; then
    swap_pct=$(((swap_total - swap_free) * 100 / swap_total))
    [ "$swap_pct" -le "$SWAP_MAX_PCT" ] || detail+="Swap ${swap_pct}% used (limit ${SWAP_MAX_PCT}%). "
  fi
  resolve memory-pressure "$detail"
}

check_containers() {
  local detail="" ids=() line service status health restarts prev new_state="" seen=""
  local state_file="$FO_STATE_DIR/restart-counts"
  mapfile -t ids < <(fo_compose ps -a -q 2>/dev/null || true)
  if [ "${#ids[@]}" -gt 0 ]; then
    while IFS='|' read -r service status health restarts exitcode; do
      seen+=" $service"
      prev="$(awk -v s="$service" '$1 == s {print $2}' "$state_file" 2>/dev/null || true)"
      new_state+="$service $restarts"$'\n'
      if [ "$status" = exited ] && [ "$exitcode" = 0 ]; then continue; fi
      if [ "$health" = unhealthy ]; then detail+="$service is unhealthy. "; fi
      case "$status" in
        restarting | dead | exited | paused) detail+="$service is $status. " ;;
      esac
      if [ -n "$prev" ] && [ "$restarts" -gt "$prev" ]; then
        detail+="$service restarted ($prev -> $restarts). "
      fi
    done < <(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.RestartCount}}|{{.State.ExitCode}}' "${ids[@]}")
  fi
  for line in db api web; do
    case " $seen " in *" $line "*) ;; *) detail+="$line container is missing. " ;; esac
  done
  printf '%s' "$new_state" >"$state_file"
  resolve container-health "$detail"
}

check_tls() {
  local detail="" pem
  if [ -z "${SITE_HOST:-}" ]; then
    fo_log "SITE_HOST not set; skipping TLS check"
    return 0
  fi
  if [ -n "${FO_TLS_PEM_CMD:-}" ]; then
    pem="$($FO_TLS_PEM_CMD 2>/dev/null || true)"
  else
    pem="$(echo | timeout 20 openssl s_client -servername "$SITE_HOST" -connect "$SITE_HOST:443" 2>/dev/null |
      openssl x509 2>/dev/null || true)"
  fi
  if [ -z "$pem" ]; then
    detail="Could not read a TLS certificate from $SITE_HOST:443."
  elif ! printf '%s\n' "$pem" | openssl x509 -noout -checkend $((TLS_DAYS * 86400)) >/dev/null; then
    detail="Certificate for $SITE_HOST expires within $TLS_DAYS days ($(printf '%s\n' "$pem" | openssl x509 -noout -enddate))."
  fi
  resolve tls-expiry "$detail"
}

check_api_5xx() {
  local n logs detail=""
  # The API logs one JSON line per finished request: {"msg":"request","status":NNN,...}.
  # (request_error lines duplicate those requests, so only "request" is counted.)
  # A failing `compose logs` must not poison the count, so capture it separately.
  logs="$(fo_compose logs --since 10m --no-log-prefix api 2>/dev/null || true)"
  n="$(printf '%s\n' "$logs" |
    jq -Rn '[inputs | fromjson? | select(type == "object" and .msg == "request" and (.status | type) == "number" and .status >= 500)] | length' 2>/dev/null)" || n=0
  case "$n" in '' | *[!0-9]*) n=0 ;; esac
  [ "$n" -le "$API_5XX_MAX" ] || detail="$n API responses with status 5xx in the last 10 minutes (limit $API_5XX_MAX)."
  resolve api-5xx "$detail"
}

check_reboot() {
  local detail="" age_days
  if [ -e "$REBOOT_FLAG" ]; then
    age_days=$((($(date +%s) - $(fo_mtime "$REBOOT_FLAG")) / 86400))
    [ "$age_days" -lt "$REBOOT_DAYS" ] || detail="A reboot has been pending for $age_days days (security updates are not fully applied)."
  fi
  resolve reboot-pending "$detail"
}

# Low priority: a <db>_old_<stamp> database left by restore.sh for more than 14 days.
check_old_databases() {
  local names name stamp epoch age_days detail=""
  names="$(fo_compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -At -c "SELECT datname FROM pg_database WHERE datname ~ '"'"'_old_[0-9]{8}t[0-9]{6}z$'"'"'"' 2>/dev/null)" || return 0
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    stamp="${name##*_old_}"
    epoch="$(date -u -d "${stamp:0:4}-${stamp:4:2}-${stamp:6:2} ${stamp:9:2}:${stamp:11:2}:${stamp:13:2}" +%s 2>/dev/null)" || continue
    age_days=$((($(date +%s) - epoch) / 86400))
    if [ "$age_days" -ge "$OLD_DB_DAYS" ]; then
      detail+="Database $name is $age_days days old (left by a production restore). Drop it once you are satisfied with the restore. "
    fi
  done <<<"$names"
  if [ -n "$detail" ]; then
    alert_set old-database firing "$detail" low-priority
  else
    alert_set old-database clear "" low-priority
  fi
}

check_disk
check_memory
check_containers
check_tls
check_api_5xx
check_reboot
check_old_databases

# Daily heartbeat for the healthcheck itself.
hb="$FO_STATE_DIR/last-heartbeat"
last=0
[ -f "$hb" ] && last="$(cat "$hb")"
if [ $(($(date +%s) - last)) -ge 82800 ]; then
  if gh_heartbeat healthcheck "ran ok"; then
    gh_dry || date +%s >"$hb"
  else
    FO_ALERT_FAILED=1
  fi
fi

[ "$FO_ALERT_FAILED" = 0 ] || fo_die "one or more GitHub calls failed"
