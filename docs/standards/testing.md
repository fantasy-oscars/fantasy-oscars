# Testing Standard

## TL;DR

- Canonical command: `npm run ci` (runs `test:*` categories, including Docker integration).
- Non-Docker suite: `npm run test:format && npm run test:lint && npm run test:typecheck && npm run test:unit && npm run test:build && npm run test:docs`.
- Unit tests for pure logic; integration tests for behavior and DB.
- DB tests run in isolated Postgres via Testcontainers; migrations auto-apply; state resets per suite.

## Test Types

- Unit: pure functions, no IO.
- Integration (API/DB): use Testcontainers Postgres; apply migrations from `db/migrations`; truncate + restart identities between tests.

## How to Run

- Full suite: `npm run ci` (matches CI).
- Non-Docker checks: `npm run test:unit` (plus `test:format`, `test:lint`, `test:typecheck`, `test:build`, `test:docs`).
- Integration tests only (Docker required): `npm run test:integration`
- API tests only: `npm run test --workspace @fantasy-oscars/api`
- Web tests only: `npm run test --workspace @fantasy-oscars/web`
- Typecheck tests too: `npm run typecheck --workspace @fantasy-oscars/api` (includes test TS config).

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
