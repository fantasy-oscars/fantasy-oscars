# Fantasy Oscars

Starter monorepo for the Fantasy Oscars app.

## Structure
- `apps/web/` — Vite + React + TypeScript frontend
- `apps/api/` — Node + TypeScript + Express API
- `packages/shared/` — shared types/utilities (no runtime deps)
- `infra/` — local infrastructure (e.g. Postgres via Docker Compose)

## Prereqs
- Node 20+
- Docker (optional, for Postgres)

## Quick start
```bash
npm install
npm run dev
```

## Database (optional)
```bash
npm run db:up
```

