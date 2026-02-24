# UI Primitives (Web)

The web app uses a small set of reusable primitives so pages read consistently and
layout/typography decisions are centralized.

These primitives are implemented in `apps/web/src/primitives/**`.

## Cards

All cards share:

- consistent radius
- consistent padding
- shadow-based elevation (no decorative borders)

Primitives:

- `HeroCard`
  - At most one per page.
  - Higher contrast surface and slightly stronger elevation.
  - Typographic-only content (title + tagline).

- `ActionCard`
  - Emphasizes a single primary action.
  - May contain one primary CTA button.

- `StandardCard`
  - Default card for discrete objects (season tiles, league tiles, etc).
  - Interactive variant uses hover elevation + subtle background change.

## Layouts

- `LandingLayout`
  - Canonical two-column layout used by the Home page:
    - left (wider): hero + content
    - right (narrower): primary actions + lists

## CSS

Baseline layout + typography classes live in:

- `apps/web/src/primitives/baseline.css`

Theme tokens and Mantine skinning live in:

- `apps/web/src/styles.css`
- `apps/web/src/theme/index.ts`
- `apps/web/src/theme/tokens.ts`

## Tokens (no literals)

The UI uses tokens everywhere. Hard-coded literals (colors, spacing, sizes, shadows, opacity)
should not appear in component code or CSS rules.

Allowed sources of truth:

- CSS variables in `apps/web/src/styles.css` (e.g. `--fo-space-*`, `--fo-shadow-*`, `--fo-*` surfaces/text)
- Theme bindings in `apps/web/src/theme/theme.ts` (Mantine mapping only)
- Theme bindings in `apps/web/src/theme/index.ts` (Mantine mapping only)
- JS/TS-only numeric tokens for props that require numbers (e.g. `iconSize={...}`):
  - `apps/web/src/tokens/**`

Spacing tokens:

- Global spacing: `--fo-space-xs|sm|md|lg` (used for page rhythm)
- Dense spacing: `--fo-space-dense-1|dense-2` (reserved for high-density surfaces like the Draft Room)

Rule of thumb:

- Prefer Mantine primitives (`Stack`, `Group`) for layout.
- Do not use numeric spacing props (e.g. `gap={6}`); use token strings instead (e.g. `gap="var(--fo-space-8)"`).
- For brittle layouts (Draft Room), introduce or reuse domain-scoped tokens (e.g. `--fo-db-*`) rather than tweaking values.

## Usage rules (orthodoxy)

- Pages (`apps/web/src/pages/**`) are glue only: call orchestration hooks and render screens.
- Screens/components render UI and consume primitives; they do not fetch data.
- If a page needs a new visual pattern, create a new primitive intentionally (do not ad-hoc style per page).

## Typography rules (baseline)

Only two font families are used:

- Serif (Cinzel): page titles, section headers, card titles, update headlines, and brand text.
- Sans: everything else (taglines, body, meta, pills, buttons, navigation, footers).

See also:

- `docs/design/typography.md` (the semantic typography variant vocabulary)
