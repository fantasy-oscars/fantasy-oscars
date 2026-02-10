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
- `apps/web/src/theme/theme.ts`

## Usage rules (orthodoxy)

- Pages (`apps/web/src/pages/**`) are glue only: call orchestration hooks and render screens.
- Screens/components render UI and consume primitives; they do not fetch data.
- If a page needs a new visual pattern, create a new primitive intentionally (do not ad-hoc style per page).
