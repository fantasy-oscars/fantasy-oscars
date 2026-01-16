# Data & Migrations

## TL;DR

- Postgres is the system of record.
- Migrations live in `db/migrations` and are ordered by a zero-padded numeric prefix (strictly increasing, no duplicates).
- Tests apply migrations automatically via Testcontainers.
- Auth data: `app_user.handle` and `app_user.email` are stored lowercase; unique indexes on `lower(...)` enforce case-insensitive uniqueness.
- Admin role: `app_user.is_admin` (boolean) flags admins; tokens carry `is_admin` and admin routes require it.
- Active ceremony: `app_config.active_ceremony_id` stores the single active ceremony; participatory actions (league/draft flow) are restricted to this ceremony.
- Seasons: `season` links a league to a ceremony; at most one EXTANT season per (league, ceremony); drafts belong to a season (one draft per season).

## Principles

- Schema changes land via migrations; never manual drift.
- Keep migrations idempotent and reversible when possible.
- Test data is isolated per run; truncate and restart identities between tests.

## Environments

- **Local / Tests:** Testcontainers Postgres, migrations auto-applied.
- **Future prod/stage:** To be defined via ADR (will follow the same migration mechanism).

## Operations

- Add migration: create `db/migrations/NNN_description.sql` with the next unused numeric prefix.
- Validate ordering: `npm run test:migrations` (part of `npm run ci`).
- Apply in tests: automatic (see `apps/api/test/db.ts`).
- Local DB (docker-compose): `npm run db:up` / `npm run db:down`.

## Links

- Architecture overview: [overview.md](overview.md)
- Test strategy: [../standards/testing.md](../standards/testing.md)
