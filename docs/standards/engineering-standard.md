# Engineering Standard (Quality Bar)

## TL;DR

- “Done” means `npm run ci` passes (lint, typecheck, tests, build) and docs are updated.
- Prefer conventional solutions; deviations require an ADR.
- Small, readable changes with clear intent; tests for behavior, not just coverage.
- Commit messages follow Conventional Commits: `type(scope): summary` (scope optional).

## Definition of Done

- All checks green: `npm run ci:all` (matches GitHub Actions: `npm run ci` + `npm run docs:check`).
- Docs updated (root README and relevant docs under `docs/`).
- No unexplained TODOs; follow-up items captured (issue or TODO with owner).
- Errors handled deliberately; no leaking stack traces to clients.

## Conventions

- Naming: descriptive and consistent; avoid abbreviations.
- Boundaries: keep API as the only backend surface; DB access behind clear helpers.
- Logging: minimal for now; avoid noisy console spam, prefer structured messages when added.
- Testing: unit where cheap, integration where behavior matters; DB tests isolated.

## Reviews (when applicable)

- Intent is obvious from code + tests.
- No silent breaking changes; user-facing changes noted in docs.
- New dependencies are justified (or recorded via ADR if non-default).

## ADR Policy

- Required for non-obvious choices or any deviation from conventional defaults.
- Template: [../adr/template.md](../adr/template.md)
