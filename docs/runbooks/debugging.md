# Runbook: Debugging

## TL;DR

- Reproduce with `pnpm run ci` or the smallest scoped command.
- For API: add temporary structured logs; avoid noisy console spam.
- For DB tests: check Docker/Testcontainers first.

## API

- Run API tests only: `pnpm run test --workspace @fantasy-oscars/api`
- Log context on errors (temporary) and remove before merging.
- Check request/response shape against contracts.

## Web

- Run web tests only: `pnpm run test --workspace @fantasy-oscars/web`
- Use Testing Library queries; avoid brittle selectors.

## DB

- Verify migrations applied: inspect `database/migrations`.
- If Testcontainers fails: confirm `docker ps` works; restart Docker if needed.

## Links

- Testing standard: [../standards/testing.md](../standards/testing.md)
