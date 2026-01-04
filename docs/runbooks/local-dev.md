# Runbook: Local Development

## TL;DR

- Install deps: `npm install`
- Canonical checks: `npm run ci`
- Dev servers: `npm run dev` (runs workspace dev scripts)
- Docker needed for DB-backed tests (Testcontainers)

## Prereqs

- Node 20+
- Docker running (for integration tests)

## Common Commands

- Install: `npm install`
- Dev: `npm run dev`
- Full checks: `npm run ci`
- Lint only: `npm run lint`
- Typecheck only: `npm run typecheck`
- Tests only: `npm test`

## Required Environment

- `PORT`: API listen port (e.g., `PORT=3001`). Missing or non-numeric values will fail startup.

## Troubleshooting

- Testcontainers fails: ensure Docker is running and accessible (`docker ps`).
- Typecheck errors in config: ensure Vite/Vitest configs are in the right files (`vite.config.ts`, `vitest.config.ts`).

## Links

- Testing standard: [../standards/testing.md](../standards/testing.md)
- Database runbook: [database.md](database.md)
