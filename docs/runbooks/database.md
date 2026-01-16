# Runbook: Database

## TL;DR

- Tests use Testcontainers Postgres; migrations auto-apply from `db/migrations`.
- Reset between test suites via truncate + identity restart.
- Local DB is provided via docker-compose and uses the same migrations.
- Backfill note: migration 010 creates `season` rows for each league (extant per ceremony) and links existing drafts to seasons. If you had local data pre-010, rerun migrations or recreate the DB to ensure drafts have `season_id`.

## Migrations

- Add: create `db/migrations/NNN_description.sql`
- Applied automatically in integration tests.
- Ordering rule: filenames use zero-padded numeric prefixes and must be strictly increasing (no duplicate numbers). Tooling sorts by numeric prefix and fails fast on duplicates.
- Validate ordering locally/CI: `npm run test:migrations` (also runs inside `npm run ci`).

## Test DB

- Powered by Testcontainers; requires Docker.
- Migrations apply on container startup.
- Cleanup: truncate all public tables and restart identities between suites.

## Local DB

- Start/stop Postgres: `npm run db:up` / `npm run db:down`.
- Only the DB is containerized (by design). Run `apps/api` / `apps/web` on the host for faster iteration and better debugging.
- Connect with: `DATABASE_URL=postgres://fantasy:fantasy@localhost:5433/fantasy_oscars`
- Apply migrations by running the app/tests that auto-apply migrations (or the dedicated migration command once it exists).

## Troubleshooting

- Testcontainers cannot start: ensure Docker daemon is running and your user can access the socket.
- Migration errors: verify SQL in `db/migrations`; ensure order is correct.

## Links

- Testing standard: [../standards/testing.md](../standards/testing.md)
- Data architecture: [../architecture/data.md](../architecture/data.md)
