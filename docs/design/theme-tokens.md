# Theme Tokens (Implementation Notes)

The authoritative token spec lived in `.codex/fantasy-oscars-codex-token-handoff.md` (removed after implementation).
This doc records the *implementation bindings* and the few places where the spec intentionally required an explicit choice.

## Where Tokens Live

- CSS token bindings: `apps/web/src/styles.css`
  - Surfaces are applied via **surface role inversion** using
    `:root[data-mantine-color-scheme="dark"|"light"]`.
  - Back-compat aliases (`--bg`, `--panel`, `--text`, `--muted`, `--border`, `--accent`) remain for legacy CSS while we migrate.
- Mantine theme knobs: `apps/web/src/theme/theme.ts`
  - Typography (sans vs serif), weights, and non–Draft Board font sizes.
  - Component geometry: radius=3px, button height=32px, paddingX=12px.
- Draft Board override: `apps/web/src/layout/DraftLayout.tsx`
  - Nested `MantineProvider` forces headings to use **sans** on Draft Board pages.

## Binding Decisions (Explicit)

- `ivory.warm` vs `ivory.neutral`
  - The token file distinguishes these, but the codebase currently has a single ivory value.
  - Both tokens are bound to the existing value `#f7f8fc`.
- Borders
  - The token spec defines `border.opacity = 12%` and forbids distinct border colors.
  - We bind borders as "current primary text hue @ 12% opacity" via:
    - dark: `rgba(ivory, 0.12)`
    - light: `rgba(charcoal, 0.12)`

## Mantine Component Skins

Mantine components are "skinned" with token-derived CSS (no per-component branching):

- `Card` uses `color.surface.card.primary`
- `Button` variants map to token hierarchy:
  - `filled` => primary action (gold)
  - `default` => secondary action (surface + border)
  - `subtle` => tertiary action (transparent + deemphasized text)

## Draft Board Density Tokens

Draft Board-specific tokens (font sizes + pill geometry) are bound in `apps/web/src/styles.css`:

- pill font: 10px
- meta font: 12px
- header font: 14px
- timer font: 24px
- pill row height: 16px
- pill paddingX: 5px
