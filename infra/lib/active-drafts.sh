#!/usr/bin/env bash
# Print the number of drafts currently IN_PROGRESS (table `draft`, column `status`).
# Used by deploy.sh and the reboot-when-idle script. Exits non-zero (printing nothing
# on stdout) when the database cannot be queried, so callers must not treat a failure
# as "zero drafts".
#
#   infra/lib/active-drafts.sh
set -euo pipefail

FO_DIR="${FO_DIR:-/srv/fantasy-oscars}"
FO_PROJECT="${FO_PROJECT:-fantasy-oscars}"

compose_args=(compose -p "$FO_PROJECT" --project-directory "$FO_DIR" -f "$FO_DIR/compose.yaml")
if [ -n "${FO_COMPOSE_EXTRA:-}" ]; then
  compose_args+=(-f "$FO_COMPOSE_EXTRA")
fi
if [ -f "$FO_DIR/.env" ]; then
  compose_args+=(--env-file "$FO_DIR/.env")
fi
if [ -f "$FO_DIR/.env-deploy" ]; then
  compose_args+=(--env-file "$FO_DIR/.env-deploy")
fi

psql_in_db() {
  docker "${compose_args[@]}" exec -T db sh -c \
    'psql -X -qtA -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"' sh "$1"
}

# A brand-new database has no draft table yet (migrations not applied): zero drafts.
has_table="$(psql_in_db "SELECT to_regclass('public.draft') IS NOT NULL")" ||
  {
    echo "active-drafts: could not query the database" >&2
    exit 1
  }
if [ "$has_table" != "t" ]; then
  echo 0
  exit 0
fi

count="$(psql_in_db "SELECT count(*) FROM draft WHERE status = 'IN_PROGRESS'")" ||
  {
    echo "active-drafts: could not query the database" >&2
    exit 1
  }
case "$count" in
  '' | *[!0-9]*)
    echo "active-drafts: unexpected result: ${count}" >&2
    exit 1
    ;;
esac
echo "$count"
