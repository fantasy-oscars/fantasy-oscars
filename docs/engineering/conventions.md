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

## Request validation

- **One schema per request shape**, defined with zod in `packages/shared/src/schemas/`
  and exported from the `@fantasy-oscars/shared/schemas` entry point. Zod is a
  dependency of `packages/shared` only; the API gets `z` and the schemas through that
  entry point. It is kept out of the main entry so code that only needs the plain
  validators or types does not pull zod into the web bundle.
- **Rules are not duplicated.** Where a schema needs an existing rule (for example
  username or password), it calls the `validate*` function from
  `packages/shared/src/auth` inside `.superRefine`, so the function and the schema
  cannot drift apart.
- **Routes parse at the boundary** with the helpers in `apps/api/src/utils/validate.ts`:
  `parseBody(schema, req.body)`, `parseParams(schema, req.params)` and
  `parseQuery(schema, req.query)`. They return the parsed, normalised value; routes
  do not hand-check `typeof` or `Number.isNaN` on request input. Numeric path ids
  use the shared `idParam` (positive integer from a string).
- **Errors map to the existing shape.** A failed parse throws
  `validationError(message, fields)`: HTTP 400, code `VALIDATION_ERROR`, and
  `details.fields` listing the offending fields. The message is the first issue's
  message (write the user-facing text in the schema) and the fields are the first
  path segment of each issue. A route can pass `{ message, fields }` to override
  either, and a custom issue can carry its own list via `params: { fields }`.
- Schemas strip unknown keys. Business checks that need the database (existence,
  permissions, state) stay in the route or service and keep their own `AppError`s.
- **Messages are for people.** Write schema messages as a sentence an end user can act
  on ("Choose a league", "That link doesn't look right"), not as a field name or
  developer note. Do not change the code or `fields` when rewording.
- **The web app shows them on the input.** A failed submit with `VALIDATION_ERROR` and
  `fields` is mapped to per-input errors by `decisions/fieldErrors.ts`; forms hold that
  state with `useFieldErrors` (`orchestration/useFieldErrors.ts`), pass `errors[name]`
  to the input's `error` prop, and call `clear(name)` when the input is edited. The
  web app never imports the schemas entry or zod; client-side pre-checks use the plain
  `validate*` functions from the main shared entry.
