# Data & Migrations

## TL;DR

- Postgres is the system of record.
- Migrations live in `db/migrations` (ordered by filename).
- Tests apply migrations automatically via Testcontainers.

## Principles

- Schema changes land via migrations; never manual drift.
- Keep migrations idempotent and reversible when possible.
- Test data is isolated per run; truncate and restart identities between tests.

## Environments

- **Local / Tests:** Testcontainers Postgres, migrations auto-applied.
- **Future prod/stage:** To be defined via ADR (will follow the same migration mechanism).

## Operations

- Add migration: create `db/migrations/NNN_description.sql`.
- Apply in tests: automatic (see `apps/api/test/db.ts`).
- Local DB (docker-compose): `npm run db:up` / `npm run db:down`.

## Links

- Architecture overview: [overview.md](overview.md)
- Test strategy: [../standards/testing.md](../standards/testing.md)
