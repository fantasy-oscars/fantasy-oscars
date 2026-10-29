#!/usr/bin/env bash
# Manually switch the stack to an earlier image tag (no migration, no backup).
#
#   infra/rollback.sh [--dry-run] <tag>
#
# Database migrations are not reverted: only roll back to a tag whose code works with
# the current schema. The tag's images must still be pullable from the registry (or
# already present on the host). The current tag becomes `previous` in deploy-state.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

tag=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) FO_DRY_RUN=1 ;;
    -h | --help)
      sed -n '2,9p' "${BASH_SOURCE[0]}"
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
[ -n "$tag" ] || die "usage: rollback.sh [--dry-run] <tag>"
valid_tag "$tag" || die "invalid tag: $tag"
[ -f "$FO_DIR/.env" ] || die "$FO_DIR/.env is missing"
[ -f "$FO_DIR/compose.yaml" ] || die "$FO_DIR/compose.yaml is missing (run deploy.sh once first)"

acquire_lock

current="$(state_get current)"
log "rolling back from ${current:-unknown} to ${tag}"

if [ "${FO_SKIP_PULL:-0}" != "1" ]; then
  IMAGE_TAG="$tag" run dc pull api web || die "image pull failed; nothing changed"
fi

if ! switch_to_tag "$tag"; then
  die "tag ${tag} failed verification; stack may be unhealthy"
fi
if [ "$FO_DRY_RUN" = "1" ]; then
  exit 0
fi
env_deploy_write "$tag"
if [ "$current" = "$tag" ]; then
  state_write "$tag" "$(state_get previous)"
else
  state_write "$tag" "$current"
fi
log "now running ${tag}"
