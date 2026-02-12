# Testing Standard

## TL;DR

- Canonical command: `pnpm run ci` (runs `ci:tests` + `ci:docs`).
- Non-Docker suite: `pnpm run test:format && pnpm run test:lint && pnpm run test:typecheck && pnpm run test:unit && pnpm run test:build && pnpm run test:e2e && pnpm run test:docs`.
- Unit tests for pure logic; integration tests for behavior and DB.
- DB tests run in isolated Postgres via Testcontainers; migrations auto-apply; state resets per suite.

## Test Types

- Unit: pure functions, no IO.
- Integration (API/DB): use Testcontainers Postgres; apply migrations from `database/migrations`; truncate + restart identities between tests.
- E2E (web smoke): Playwright; runs against `apps/web` via `vite preview` to ensure the web app loads.

## How to Run

- Full suite: `pnpm run ci` (matches CI).
- Tests only: `pnpm run ci:tests`
- Docs only: `pnpm run ci:docs`
- Non-Docker checks: `pnpm run test:unit` (plus `test:format`, `test:lint`, `test:typecheck`, `test:build`, `test:docs`).
- Integration tests only (Docker required): `pnpm run test:integration`
- Integration tests (bail early): `pnpm run test:integration:bail`
- E2E smoke tests: `pnpm run test:e2e`
- Install Playwright Chromium (one-time per machine): `pnpm run test:e2e:install`
- API tests only: `pnpm run test --workspace @fantasy-oscars/api`
- Web tests only: `pnpm run test --workspace @fantasy-oscars/web`
- Typecheck tests too: `pnpm run typecheck --workspace @fantasy-oscars/api` (includes test TS config).

## Tips

- Make API logs readable during tests (if you need them):
  - Default is silent during tests (`LOG_LEVEL=silent`).
  - Opt in to readable request logs: `LOG_LEVEL=info LOG_FORMAT=pretty pnpm run test:integration --workspace @fantasy-oscars/api`
  - If you need error stack traces from the API during tests: set `LOG_STACK=1`

## Isolation Rules

- Each integration test suite: fresh DB via Testcontainers.
- After each suite: truncate tables and restart identities.
- No shared state across test runs.

## Flake Policy

- Flakes are bugs; investigate root cause, don’t mute.
- DB startup failures: check Docker access for Testcontainers.

## Links

- Data/migrations: [../architecture/data.md](../architecture/data.md)
- Runbook (DB): [../runbooks/database.md](../runbooks/database.md)
