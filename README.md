# Fantasy Oscars

Fantasy league drafting for the Academy Awards. Users create leagues and seasons, run live real-time drafts of nominees, and follow scoring; admins manage ceremonies, nominees and scoring.

## Structure

- `apps/web/` — Vite + React + TypeScript frontend
- `apps/api/` — Node + TypeScript + Express API
- `packages/shared/` — shared types/utilities (no runtime deps)
- `database/` — numbered SQL migrations and fixtures
- `tooling/infra/` — local infrastructure (Postgres via Docker Compose)
- `docs/` — architecture, ADRs, runbooks, standards

## Prereqs

- Node 24 (see `.nvmrc`; enable Corepack: `corepack enable`)
- pnpm 9 (handled by Corepack)
- Docker (for DB-backed tests)

## Quick start

```bash
pnpm install
pnpm dev
```

## Local development (recommended)

Create local env files (not committed):

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

### TMDB (optional)

If you want to hydrate films/people from TMDB (poster + cast/crew), set `TMDB_READ_ACCESS_TOKEN`
in `apps/api/.env`.

Start Postgres, apply migrations, and run API + web:

```bash
pnpm run dev:local
```

## Tests

- Run the full suite (matches CI): `pnpm run ci`
- Run non-Docker checks only: `pnpm run test:unit` (plus `test:format`, `test:lint`, `test:typecheck`, `test:build`, `test:docs`)
- Requires Docker for database-backed tests (Testcontainers launches an isolated Postgres)

Remove build outputs (`dist/` folders and `*.tsbuildinfo`): `pnpm run clean`

## Documentation

- Docs index: `docs/README.md`
- Architecture: `docs/architecture/overview.md`
- Standards (quality bar, testing, lint/format): `docs/standards/`
- Runbooks: `docs/runbooks/`
- ADRs: `docs/adr/`

## Database (optional)

```bash
pnpm run db:up
```

Apply migrations against the configured `DATABASE_URL`:

```bash
pnpm run db:migrate
```
