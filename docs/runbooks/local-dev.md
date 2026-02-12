# Runbook: Local Development

## TL;DR

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm run dev:local
```

- Canonical checks: `pnpm run ci`
- Docker needed for DB-backed tests (Testcontainers)

## Prereqs

- Node 20+
- Enable Corepack: `corepack enable`
- Docker running (for integration tests)

## Common Commands

- Install: `pnpm install`
- Dev (recommended): `pnpm run dev:local` (DB + migrate + API + web)
- Dev (servers only): `pnpm run dev` (runs workspace dev scripts)
- Full checks: `pnpm run ci`
- Lint only: `pnpm run lint`
- Typecheck only: `pnpm run typecheck`
- Tests only: `pnpm test`
- Reset local DB (destructive): `pnpm run dev:local:reset`
- Seed minimal test ceremony dataset (idempotent):

  ```bash
  pnpm run nominees:load --workspace @fantasy-oscars/api -- --file database/fixtures/dev-minimal-nominees.json
  ```

  Expected: loads a single ceremony `dev-test-2026` with one category (Best Picture) and one nomination, ready for draft testing.

## Required Environment

We use per-app env files for local dev:

- API: `apps/api/.env` (see `apps/api/.env.example`)
  - `PORT`: API listen port (e.g., `PORT=4010`). Missing or non-numeric values will fail startup.
  - `AUTH_SECRET`: Secret for signing/verifying auth tokens (any sufficiently random string for local dev).
  - `DATABASE_URL`: Postgres connection string (docker-compose default is `postgres://fantasy:fantasy@localhost:5433/fantasy_oscars`).
  - `CORS_ALLOWED_ORIGINS`: Comma-separated allowlist (include `http://localhost:5173` for Vite).
  - `REALTIME_ENABLED`: Optional kill switch for Socket.IO realtime drafting (`true`/`false`, defaults to `true`).
- Web: `apps/web/.env` (see `apps/web/.env.example`)
  - `VITE_API_BASE`: Base URL for API requests (e.g. `http://localhost:4010`).

## Troubleshooting

- Register is 404 on `localhost:5173`: web is calling itself. Ensure `apps/web/.env` sets `VITE_API_BASE=http://localhost:4010`.
- Testcontainers fails: ensure Docker is running and accessible (`docker ps`).
- Typecheck errors in config: ensure Vite/Vitest configs are in the right files (`vite.config.ts`, `vitest.config.ts`).

## Links

- Testing standard: [../standards/testing.md](../standards/testing.md)
- Database runbook: [database.md](database.md)
