# Fantasy Oscars

Starter monorepo for the Fantasy Oscars app.

## Structure

- `apps/web/` — Vite + React + TypeScript frontend
- `apps/api/` — Node + TypeScript + Express API
- `packages/shared/` — shared types/utilities (no runtime deps)
- `infra/` — local infrastructure (e.g. Postgres via Docker Compose)

## Prereqs

- Node 20+ (enable Corepack: `corepack enable`)
- pnpm 9 (handled by Corepack)
- Docker (for DB-backed tests)

## Quick start

```bash
pnpm install
pnpm dev
```

## Tests

- Run the full suite (matches CI): `pnpm run ci`
- Run non-Docker checks only: `pnpm run test:unit` (plus `test:format`, `test:lint`, `test:typecheck`, `test:build`, `test:docs`)
- Requires Docker for database-backed tests (Testcontainers launches an isolated Postgres)

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
