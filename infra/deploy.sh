#!/usr/bin/env bash
# Deploy an image tag on the server (run as the deploy user, normally over SSH by the
# deploy workflow, from the synced copy of this directory).
#
#   infra/deploy.sh [--force] [--dry-run] <tag>
#
#   --force    deploy even while drafts are IN_PROGRESS
#   --dry-run  print what would change; nothing is modified
#
# Steps: sync compose file, draft guard, pre-deploy backup (if infra/backup.sh exists),
# pull images, migrate, up, verify (container health + HTTPS through Caddy). A failed
# verification rolls back to the previously deployed tag and exits non-zero.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

force=0
tag=""
while [ $# -gt 0 ]; do
  case "$1" in
    --force) force=1 ;;
    --dry-run) FO_DRY_RUN=1 ;;
    -h | --help)
      sed -n '2,12p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    -*) die "unknown option: $1" ;;
    *)
      [ -z "$tag" ] || die "only one tag may be given"
      tag="$1"
      ;;
  esac
  shift
done
[ -n "$tag" ] || die "usage: deploy.sh [--force] [--dry-run] <tag>"
valid_tag "$tag" || die "invalid tag: $tag"
[ -f "$FO_DIR/.env" ] || die "$FO_DIR/.env is missing (create it from the runbook first)"

acquire_lock

# 1. Sync the compose file next to the secrets so plain `docker compose -p` works there.
if ! cmp -s "$SCRIPT_DIR/compose.prod.yml" "$FO_DIR/compose.yaml" 2>/dev/null; then
  log "syncing compose.prod.yml to $FO_DIR/compose.yaml"
  run install -m 644 "$SCRIPT_DIR/compose.prod.yml" "$FO_DIR/compose.yaml"
fi
# In dry-run on a host that has never been synced there is nothing to query yet.
[ -f "$FO_DIR/compose.yaml" ] || {
  log "no compose.yaml in $FO_DIR yet; nothing more to inspect in dry-run"
  exit 0
}

current="$(state_get current)"
previous="$(state_get previous)"
log "requested tag: ${tag}; currently deployed: ${current:-none}; previous: ${previous:-none}"

# 2. First deploy is decided from persistent state only (never from container state):
# no recorded deployment AND no database volume yet. Anything else is an existing
# server, where the database must come up before the draft guard and backup run.
first_deploy=0
if [ -z "$current" ] && ! docker volume inspect "${FO_PROJECT}_pgdata" >/dev/null 2>&1; then
  first_deploy=1
fi

if [ "$first_deploy" = "1" ]; then
  log "first deploy (no deploy-state and no ${FO_PROJECT}_pgdata volume); skipping draft guard and backup"
else
  log "ensuring the database is up before the draft guard"
  IMAGE_TAG="$tag" run dc up -d --wait db || die "database could not be started; refusing to deploy"

  # 2a. Draft guard.
  if [ "$FO_DRY_RUN" = "1" ] && ! db_running; then
    log "dry-run: database is not running, so the draft guard cannot be evaluated"
  else
    active="$("$SCRIPT_DIR/lib/active-drafts.sh")" || die "could not determine active drafts; refusing to deploy"
    if [ "$active" -gt 0 ]; then
      if [ "$force" = "1" ]; then
        log "WARNING: ${active} draft(s) IN_PROGRESS; continuing because of --force"
      else
        die "${active} draft(s) IN_PROGRESS; refusing to deploy (use --force to override)"
      fi
    fi
  fi

  # 3. Pre-deploy backup. Required: a missing hook fails the deploy unless explicitly
  # waived (FO_ALLOW_NO_BACKUP=1); a failing hook always aborts.
  if [ -f "$SCRIPT_DIR/backup.sh" ]; then
    log "running pre-deploy backup"
    run bash "$SCRIPT_DIR/backup.sh" --reason pre-deploy || die "pre-deploy backup failed; aborting"
  elif [ "${FO_ALLOW_NO_BACKUP:-0}" = "1" ]; then
    log "WARNING: infra/backup.sh is missing; continuing because FO_ALLOW_NO_BACKUP=1"
  else
    die "infra/backup.sh is missing; refusing to deploy without a backup (FO_ALLOW_NO_BACKUP=1 to waive)"
  fi
fi

# 4. Pull app images (nothing running is touched if this fails). The pinned db image is
# fetched by `up` only when it is not present, so it is not re-pulled on every deploy.
if [ "${FO_SKIP_PULL:-0}" = "1" ]; then
  log "FO_SKIP_PULL=1: using locally available images"
else
  log "pulling images for tag ${tag}"
  IMAGE_TAG="$tag" run dc pull api web || die "image pull failed; nothing changed"
fi

# 5. Migrate. Old containers keep running; a failed migration aborts without a rollback.
log "ensuring the database is up and running migrations"
IMAGE_TAG="$tag" run dc up -d --wait db || die "database did not become healthy"
IMAGE_TAG="$tag" run dc run --rm migrate || die "migration failed; the running version was not changed"

# 6. Switch and verify; roll back to the previous tag on failure.
if switch_to_tag "$tag"; then
  if [ "$FO_DRY_RUN" = "1" ]; then
    log "dry-run complete; deploy-state and .env-deploy untouched"
    exit 0
  fi
  env_deploy_write "$tag"
  if [ "$current" = "$tag" ]; then
    state_write "$tag" "$previous"
  else
    state_write "$tag" "$current"
  fi
  log "deployed ${tag} (previous: ${current:-none})"
  keep_previous="$(state_get previous)"
  prune_old_images "$tag" "$keep_previous"
  exit 0
fi

log "verification failed for ${tag}"
rollback_to="$current"
if [ -z "$rollback_to" ] || [ "$rollback_to" = "$tag" ]; then
  rollback_to="$previous"
fi
if [ -n "$rollback_to" ] && [ "$rollback_to" != "$tag" ]; then
  log "rolling back to ${rollback_to}"
  if switch_to_tag "$rollback_to"; then
    env_deploy_write "$rollback_to"
    log "rolled back to ${rollback_to}; the failed tag ${tag} is NOT deployed"
  else
    log "rollback to ${rollback_to} ALSO failed; manual intervention required"
  fi
else
  log "no previous tag recorded; leaving the stack as is"
fi
exit 1
