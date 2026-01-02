# Linting & Formatting

## TL;DR

- Canonical lint: `npm run lint`
- Canonical format: `npm run format`
- ESLint uses TypeScript + React plugins; `npm run ci` enforces lint before tests.

## Lint

- Run: `npm run lint`
- Scope: all packages (workspace-aware)
- Don’t disable rules unless justified in code with a short comment.

## Format

- Run: `npm run format`
- Formatter: Prettier (root config `.prettierrc.json`)

## CI

- `npm run ci` runs lint first; fixes must land before tests/build.

## Links

- Engineering standard: [engineering-standard.md](engineering-standard.md)
