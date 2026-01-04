# Test Factories (API-local)

This directory contains API-local test factories/fixtures for `apps/api`.

## Migration Note (Read Me)

This is a **starting point**, not a permanent home. Promote factories to a shared package (e.g. `packages/shared`) when:

- Domain types are stable and reused by both API and web.
- Frontend tests need the same core entities (drafts, picks, nominees, etc.).
- Factory logic is meaningfully duplicated across apps.

Benefits of migrating later:

- Single source of truth for domain types + factories.
- Reuse across all test suites.
- Less drift between services.

A backlog issue tracks this migration so it isn’t forgotten.
