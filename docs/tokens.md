# UI Tokens

All UI tokens are defined in the web theme layer and surfaced as CSS variables.

## Source of truth

- Generated token map: `apps/web/src/theme/tokens.ts`
- Theme wiring: `apps/web/src/theme/index.ts` (exports tokens via `cssVariablesResolver`)
- Global stylesheet bindings: `apps/web/src/styles.css` (binds Mantine variables to app tokens)

## How to use tokens

Preferred:

- Use Mantine props that accept token strings:
  - `gap="var(--fo-space-8)"`
  - `mt="var(--fo-space-12)"`
- Use CSS that references variables:
  - `color: var(--fo-text-primary);`

Avoid:

- Raw `px`/`rem` literals in feature code.
- Raw hex colors in feature code.

## Breakpoints & media queries (exception)

CSS custom properties cannot be used reliably inside `@media (...)` conditions, so
we allow numeric breakpoint literals *only* in media query conditions.

Rules:

- Source of truth for breakpoints is still `apps/web/src/theme/index.ts` (`theme.breakpoints`).
- `apps/web/src/primitives/baseline.css` and `apps/web/src/styles.css` may contain `@media (max-width: Npx)` literals.
- Do not use `px` literals in CSS declarations (e.g. `padding: 12px;`) or in TS/TSX.

## Naming conventions

- `--fo-space-*`: spacing scale (used for layout rhythm)
- `--fo-radius-*`: border radius
- `--fo-alpha-*`: normalized alpha values (used in `rgba(..., var(--fo-alpha-XX))`)
- `--fo-surface-*`: surface roles (backgrounds)
- `--fo-text-*`: text roles
