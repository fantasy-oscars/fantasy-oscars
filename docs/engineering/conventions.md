# Engineering Conventions

This repo uses a small set of conventions to keep the codebase easy to navigate,
review, and refactor.

## Naming

### TypeScript

- **Types / interfaces / enums / classes:** PascalCase
- **Functions / variables / object keys:** camelCase
- **Constants:** camelCase by default; UPPER_SNAKE_CASE only for true constants
  that are used like configuration flags.

### React

- **Components:** PascalCase
- **Hooks:** `useXyz` (camelCase, prefixed with `use`)

### Files

- **React components:** `PascalCase.tsx` (one primary component per file)
- **Hooks:** `useXyz.ts` or `useXyz.tsx`
- **Modules:** `camelCase.ts`
- **Tests:** `*.test.ts` / `*.test.tsx`

## Lint and Type Safety

- **Do not suppress lint or type checking inline.** Fix the code or adjust rules
  at the configuration level where appropriate (for example, scripts/tests may
  allow console output).

## Frontend Layering (Atomization)

When changing or adding frontend code, keep responsibilities separated:

- **Decision:** pure rules; no IO
- **Orchestration:** workflows; calls decisions + APIs
- **Glue:** one orchestration call at the screen boundary; passes props/callbacks
- **UI:** rendering-only; no rules, no API calls, no orchestration imports

This keeps presentation swappable without changing behavior.
