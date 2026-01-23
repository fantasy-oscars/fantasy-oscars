# Linting & Formatting

## TL;DR

- Canonical lint: `pnpm run lint`
- Canonical format: `pnpm run format`
- ESLint uses TypeScript + React plugins; `pnpm run ci` enforces lint before tests.

## Lint

- Run: `pnpm run lint`
- Scope: all packages (workspace-aware)
- Don’t disable rules unless justified in code with a short comment.

## Format

- Run: `pnpm run format`
- Formatter: Prettier (root config `.prettierrc.json`)

## CI

- `pnpm run ci` runs lint first; fixes must land before tests/build.

## Links

- Engineering standard: [engineering-standard.md](engineering-standard.md)
