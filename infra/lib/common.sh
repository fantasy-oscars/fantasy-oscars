#!/usr/bin/env bash
# Shared helpers for the infra scripts. Source this file; do not execute it.
#
# Layout on the server (override FO_DIR only for tests):
#   $FO_DIR/.env            secrets (mode 600)
#   $FO_DIR/.env-deploy     IMAGE_TAG=<tag> (non-secret)
#   $FO_DIR/deploy-state    current=<tag> and previous=<tag>
#   $FO_DIR/compose.yaml    copy of infra/compose.prod.yml, so that plain
#                           `docker compose -p fantasy-oscars ...` works from $FO_DIR
#
# Test hooks (not used in production): FO_PROJECT, FO_COMPOSE_EXTRA (extra -f file),
# FO_SKIP_PULL=1, FO_CURL_INSECURE=1, FO_HEALTH_TIMEOUT (seconds).

FO_DIR="${FO_DIR:-/srv/fantasy-oscars}"
FO_PROJECT="${FO_PROJECT:-fantasy-oscars}"
FO_HEALTH_TIMEOUT="${FO_HEALTH_TIMEOUT:-180}"
FO_DRY_RUN="${FO_DRY_RUN:-0}"
FO_IMAGE_REPOS="${FO_IMAGE_REPOS:-ghcr.io/fantasy-oscars/fantasy-oscars-api ghcr.io/fantasy-oscars/fantasy-oscars-web}"
FO_PRUNE_DAYS="${FO_PRUNE_DAYS:-7}"
# Children (active-drafts.sh, backup.sh) read these.
export FO_DIR FO_PROJECT FO_COMPOSE_EXTRA FO_HEALTH_TIMEOUT FO_IMAGE_REPOS

log() { printf '%s [infra] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
die() {
  log "ERROR: $*"
  exit 1
}

# Run a mutating command, or only print it in dry-run mode.
run() {
  if [ "$FO_DRY_RUN" = "1" ]; then
    log "DRY-RUN: $*"
    return 0
  fi
  "$@"
}

# docker compose bound to the project, the server directory and its env files.
# IMAGE_TAG in the caller's environment wins over .env-deploy.
dc() {
  local args=(compose -p "$FO_PROJECT" --project-directory "$FO_DIR" -f "$FO_DIR/compose.yaml")
  if [ -n "${FO_COMPOSE_EXTRA:-}" ]; then
    args+=(-f "$FO_COMPOSE_EXTRA")
  fi
  if [ -f "$FO_DIR/.env" ]; then
    args+=(--env-file "$FO_DIR/.env")
  fi
  if [ -f "$FO_DIR/.env-deploy" ]; then
    args+=(--env-file "$FO_DIR/.env-deploy")
  fi
  docker "${args[@]}" "$@"
}

valid_tag() {
  [[ "$1" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]]
}

# Read a key from the deploy-state file; prints nothing when absent.
state_get() {
  local key="$1"
  [ -f "$FO_DIR/deploy-state" ] || return 0
  sed -n "s/^${key}=//p" "$FO_DIR/deploy-state" | head -n 1
}

state_write() {
  local current="$1" previous="$2" tmp
  tmp="$(mktemp "$FO_DIR/.deploy-state.XXXXXX")"
  printf 'current=%s\nprevious=%s\n' "$current" "$previous" >"$tmp"
  mv "$tmp" "$FO_DIR/deploy-state"
}

env_deploy_write() {
  local tag="$1" tmp
  tmp="$(mktemp "$FO_DIR/.env-deploy.XXXXXX")"
  printf 'IMAGE_TAG=%s\n' "$tag" >"$tmp"
  mv "$tmp" "$FO_DIR/.env-deploy"
}

# Look a plain KEY=value up in .env without sourcing it.
env_get() {
  local key="$1" default="${2:-}" value=""
  if [ -f "$FO_DIR/.env" ]; then
    value="$(sed -n "s/^${key}=//p" "$FO_DIR/.env" | tail -n 1)"
    value="${value%\"}"
    value="${value#\"}"
  fi
  printf '%s' "${value:-$default}"
}

# Take an exclusive lock so two deploys can never overlap on the server.
acquire_lock() {
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$FO_DIR/.deploy.lock"
    flock -n 9 || die "another deploy is already running"
  fi
}

db_running() {
  [ -n "$(dc ps --status running -q db 2>/dev/null)" ]
}

service_health() {
  local cid
  cid="$(dc ps -q "$1" 2>/dev/null | head -n 1)"
  [ -n "$cid" ] || {
    echo missing
    return 0
  }
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid"
}

# Wait until the api container reports healthy (readiness: DB + migrations).
wait_api_healthy() {
  local deadline=$((SECONDS + FO_HEALTH_TIMEOUT)) status
  while [ "$SECONDS" -lt "$deadline" ]; do
    status="$(service_health api)"
    if [ "$status" = "healthy" ]; then
      return 0
    fi
    sleep 3
  done
  log "api did not become healthy within ${FO_HEALTH_TIMEOUT}s (last status: ${status:-unknown})"
  return 1
}

# End-to-end check through Caddy over HTTPS. --resolve pins the site host to this
# machine, so DNS state cannot matter, while the certificate is still validated.
# The first request after a fresh deploy can wait on certificate issuance, so retry.
check_https_ready() {
  local host curl_args deadline
  host="$(env_get SITE_HOST www.fantasy-oscars.com)"
  curl_args=(-fsS --max-time 10 --resolve "${host}:443:127.0.0.1" -o /dev/null)
  if [ "${FO_CURL_INSECURE:-0}" = "1" ]; then
    curl_args+=(-k)
  fi
  deadline=$((SECONDS + FO_HEALTH_TIMEOUT))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if curl "${curl_args[@]}" "https://${host}/api/health/ready"; then
      log "https://${host}/api/health/ready OK"
      return 0
    fi
    sleep 5
  done
  log "https://${host}/api/health/ready did not return 200 within ${FO_HEALTH_TIMEOUT}s"
  return 1
}

# The running api and web containers must be on the requested tag. Without this a
# failed `up` (old containers still serving, still healthy) would look like success.
verify_running_tag() {
  local tag="$1" service cid image
  for service in api web; do
    cid="$(dc ps -q "$service" 2>/dev/null | head -n 1)"
    [ -n "$cid" ] || {
      log "no running ${service} container"
      return 1
    }
    image="$(docker inspect --format '{{.Config.Image}}' "$cid")"
    if [ "${image##*:}" != "$tag" ]; then
      log "${service} is running ${image}, expected tag ${tag}"
      return 1
    fi
  done
}

# Bring api + web up on the given tag and verify them end to end. Callers use this in
# an `if`, where `set -e` is off, so every step must fail explicitly.
switch_to_tag() {
  local tag="$1"
  log "starting api and web on tag ${tag}"
  IMAGE_TAG="$tag" run dc up -d --remove-orphans db api web || return 1
  if [ "$FO_DRY_RUN" = "1" ]; then
    return 0
  fi
  verify_running_tag "$tag" || return 1
  wait_api_healthy || return 1
  check_https_ready || return 1
  verify_running_tag "$tag" || return 1
}

# Remove app images (only the two repositories in FO_IMAGE_REPOS) older than
# FO_PRUNE_DAYS, always keeping the tags passed as arguments. Never touches anything else.
prune_old_images() {
  local cutoff repo tag created
  cutoff="$(date -u -d "${FO_PRUNE_DAYS} days ago" +%Y-%m-%dT%H:%M:%S 2>/dev/null ||
    date -u -v-"${FO_PRUNE_DAYS}"d +%Y-%m-%dT%H:%M:%S)"
  for repo in $FO_IMAGE_REPOS; do
    while read -r tag; do
      [ -n "$tag" ] && [ "$tag" != "<none>" ] || continue
      case " $* " in *" $tag "*) continue ;; esac
      created="$(docker image inspect --format '{{.Created}}' "${repo}:${tag}" 2>/dev/null || true)"
      if [ -n "$created" ] && [[ "$created" < "$cutoff" ]]; then
        log "removing old image ${repo}:${tag}"
        run docker rmi "${repo}:${tag}" >/dev/null 2>&1 || true
      fi
    done < <(docker image ls --format '{{.Tag}}' "$repo")
  done
}
