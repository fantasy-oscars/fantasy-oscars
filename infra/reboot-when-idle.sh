#!/usr/bin/env bash
# Daily ~04:00 Pacific: reboot to finish kernel/library updates, but only when no draft is live.
#
#   infra/reboot-when-idle.sh [--dry-run]
#
# - /var/run/reboot-required absent: nothing to do.
# - present and 0 IN_PROGRESS drafts: reboot (containers use restart: unless-stopped).
# - backup lock ($FO_STATE_DIR/backup.lock) or deploy lock ($FO_DEPLOY_LOCK) held: skip.
# - present and drafts active: skip; tomorrow tries again.
# - pending for more than FO_REBOOT_DAYS (3) days: raise the reboot-pending alert instead
#   (the healthcheck keeps the same issue updated and closes it after the reboot).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FO_TAG=reboot-when-idle
# shellcheck source=lib/ops.sh
. "$SCRIPT_DIR/lib/ops.sh"
# shellcheck source=lib/github.sh
. "$SCRIPT_DIR/lib/github.sh"
# shellcheck source=lib/alerts.sh
. "$SCRIPT_DIR/lib/alerts.sh"

DRY=0
[ "${1:-}" = --dry-run ] && DRY=1 && export FO_DRYRUN=1

fo_load_env
REBOOT_FLAG="${FO_REBOOT_FLAG:-/var/run/reboot-required}"
REBOOT_DAYS="${FO_REBOOT_DAYS:-3}"

if [ ! -e "$REBOOT_FLAG" ]; then
  fo_log "no reboot pending"
  exit 0
fi

DEPLOY_LOCK="${FO_DEPLOY_LOCK:-$FO_INSTALL_DIR/.deploy.lock}"
if fo_lock_held "$FO_STATE_DIR/backup.lock" || fo_lock_held "$DEPLOY_LOCK"; then
  fo_log "a backup or deploy is running; not rebooting now (tomorrow's run retries)"
  exit 0
fi

age_days=$((($(date +%s) - $(fo_mtime "$REBOOT_FLAG")) / 86400))
drafts="$(fo_active_drafts)" || fo_die "could not determine active drafts; not rebooting"
case "$drafts" in '' | *[!0-9]*) fo_die "active-drafts returned '$drafts'; not rebooting" ;; esac

if [ "$drafts" -eq 0 ]; then
  fo_log "reboot pending for $age_days day(s) and no active drafts: rebooting"
  if [ "$DRY" = 1 ]; then
    echo "DRYRUN would reboot"
  else
    # The deploy user may run exactly this command (sudoers drop-in from provision.sh).
    read -ra reboot_cmd <<<"${FO_REBOOT_CMD:-sudo -n /usr/bin/systemctl reboot}"
    "${reboot_cmd[@]}"
  fi
  exit 0
fi

fo_log "reboot pending ($age_days day(s)) but $drafts draft(s) in progress; skipping"
if [ "$age_days" -ge "$REBOOT_DAYS" ]; then
  mkdir -p "$FO_STATE_DIR"
  if ! gh_dry; then
    fo_require GH_MONITOR_TOKEN GH_MONITOR_REPO
  fi
  alert_set reboot-pending firing "A reboot has been pending for $age_days days and drafts keep blocking it ($drafts in progress)."
fi
