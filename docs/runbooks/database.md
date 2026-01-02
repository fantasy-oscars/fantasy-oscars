# Runbook: Database

## TL;DR

- Tests use Testcontainers Postgres; migrations auto-apply from `db/migrations`.
- Reset between test suites via truncate + identity restart.
- Local DB via docker-compose (future) will use the same migrations.

## Migrations

- Add: create `db/migrations/NNN_description.sql`
- Applied automatically in integration tests.
- Keep filenames ordered; avoid breaking existing numbers.

## Test DB

- Powered by Testcontainers; requires Docker.
- Migrations apply on container startup.
- Cleanup: truncate all public tables and restart identities between suites.

## Local DB (future)

- Use `npm run db:up` / `db:down` (when docker-compose is wired).
- Apply migrations using the same scripts (to be added alongside compose).

## Troubleshooting

- Testcontainers cannot start: ensure Docker daemon is running and your user can access the socket.
- Migration errors: verify SQL in `db/migrations`; ensure order is correct.

## Links

- Testing standard: [../standards/testing.md](../standards/testing.md)
- Data architecture: [../architecture/data.md](../architecture/data.md)
