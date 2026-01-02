# Fantasy Oscars

Starter monorepo for the Fantasy Oscars app.

## Structure

- `apps/web/` — Vite + React + TypeScript frontend
- `apps/api/` — Node + TypeScript + Express API
- `packages/shared/` — shared types/utilities (no runtime deps)
- `infra/` — local infrastructure (e.g. Postgres via Docker Compose)

## Prereqs

- Node 20+
- Docker (for DB-backed tests)

## Quick start

```bash
npm install
npm run dev
```

## Tests

- Run the full suite (matches CI): `npm run ci`
- Requires Docker for database-backed tests (Testcontainers launches an isolated Postgres)

## Documentation

- Docs index: `docs/README.md`
- Architecture: `docs/architecture/overview.md`
- Standards (quality bar, testing, lint/format): `docs/standards/`
- Runbooks: `docs/runbooks/`
- ADRs: `docs/adr/`

## Database (optional)

```bash
npm run db:up
```
