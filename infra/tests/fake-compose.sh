#!/usr/bin/env bash
# Stand-in for `docker compose ...` that maps the db service onto the throwaway container
# named by FO_TEST_DB_CONTAINER. Test use only.
set -euo pipefail
sub="${1:-}"
case "$sub" in
  exec)
    # FO_TEST_PSQL_OUT: canned output for `exec` (used where no database container exists)
    if [ -n "${FO_TEST_PSQL_OUT:-}" ]; then
      cat "$FO_TEST_PSQL_OUT"
      exit 0
    fi
    shift
    # exec [-T] db CMD...
    [ "${1:-}" = -T ] && shift
    [ "${1:-}" = db ] || exit 1
    shift
    exec docker exec -i "$FO_TEST_DB_CONTAINER" "$@"
    ;;
  ps) cat "${FO_TEST_PS_IDS:-/dev/null}" ;;
  logs)
    cat "${FO_TEST_API_LOG:-/dev/null}"
    [ -z "${FO_TEST_LOGS_FAIL:-}" ] || exit 1
    ;;
  stop | start) echo "$*" >>"${FO_TEST_COMPOSE_LOG:-/dev/null}" ;;
  *) exit 1 ;;
esac
