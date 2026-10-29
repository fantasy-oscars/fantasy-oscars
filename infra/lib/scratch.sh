#!/usr/bin/env bash
# Throwaway Postgres container helpers (restore verification). Source after ops.sh.
# Only ever touches the container it created (name prefix fo-ops-scratch-).
# shellcheck shell=bash

FO_SCRATCH_IMAGE="${FO_SCRATCH_IMAGE:-postgres:18.6}"
FO_SCRATCH_NAME=""

scratch_start() {
  FO_SCRATCH_NAME="fo-ops-scratch-$$-$(date +%s)"
  local attempt
  for attempt in 1 2; do
    if docker run -d --name "$FO_SCRATCH_NAME" \
      -e POSTGRES_USER=scratch -e POSTGRES_PASSWORD=scratch -e POSTGRES_DB=scratch \
      "$FO_SCRATCH_IMAGE" >/dev/null; then
      break
    fi
    docker rm -f -v "$FO_SCRATCH_NAME" >/dev/null 2>&1 || true
    [ "$attempt" = 2 ] && fo_die "could not start scratch container"
    fo_log "scratch container start failed; retrying once"
  done

  for _ in $(seq 1 60); do
    # The image restarts the server once after init; require two consecutive successes.
    if docker exec "$FO_SCRATCH_NAME" pg_isready -U scratch -d scratch >/dev/null 2>&1; then
      sleep 2
      docker exec "$FO_SCRATCH_NAME" pg_isready -U scratch -d scratch >/dev/null 2>&1 && return 0
    fi
    sleep 1
  done
  fo_die "scratch postgres did not become ready"
}

# scratch_restore DUMPFILE (plaintext custom-format dump)
scratch_restore() {
  docker exec -i "$FO_SCRATCH_NAME" pg_restore -U scratch -d scratch --no-owner --exit-on-error <"$1"
}

scratch_stop() {
  if [ -n "$FO_SCRATCH_NAME" ]; then
    docker rm -f -v "$FO_SCRATCH_NAME" >/dev/null 2>&1 || true
    FO_SCRATCH_NAME=""
  fi
}
