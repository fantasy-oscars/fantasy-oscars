# ADR 0008: Rule-based visual assertions

- Status: Accepted
- Date: 2026-11-23

## Context

The visual assertion tier walked every screen in every brand, both modes and both
viewports: structure, overflow, clipped text, overlap, touch targets and axe contrast. Its
cost grew linearly with themes, about five worker-minutes per brand, and the job already
took six and a half minutes for seven brands. Movie themes are meant to grow to dozens or
hundreds.

Screens do not vary by theme. A theme can differ from another only through the closed slot
set in `apps/web/src/theme/brands/contract.ts`, and `pnpm run tokens:check` fails raw
colours, fonts and radii anywhere else. So contrast depends only on which colour properties
are painted over which, and layout depends on the theme only through its geometry slots
(fonts, sizes, tracking, case, borders, radii, decorations).

## Decision

Test the screens once and the themes through rules on their values. A theme is one brand
in one mode.

1. **Screen sweep.** Every screen, the specimen and the draft stress data, at desktop and
   phone width, in one test-only theme: the probe-stress theme
   (`tests/visual/fixtures/probeStressTheme.ts`). Its geometry is the largest value any
   shipped theme uses for every geometry slot. Its colours are probes: each colour property
   of the brand layer (generated `--brand-*` properties and the shared `--fo-*` colours) has
   its own value, with the transparency the theme would give it, so a computed colour maps
   back to the property that painted it. The sweep runs the existing layout checks once
   and records, for every text node axe's color-contrast rule evaluates (every screen at
   desktop, the specimen at both widths, as the old tier ran axe), every shown placeholder
   and every draft room icon: the foreground expression, the stack of background
   expressions down to the root, and the size bucket. It records in both modes, because
   some app rules are scoped to one mode. A second palette confirms each decoding: a colour
   that does not change between palettes is a constant; one that changes must decode to
   the same expression under both. Text axe reports as incomplete is listed as unchecked.
2. **Pair registry.** The sweep's pairs live in `tests/visual/assertions/pairs.json`. A pair
   the registry lacks fails the sweep cell; a registry pair no screen uses fails the full
   run. `node tests/visual/run.mjs --tier assertions --update` regenerates it, and the diff
   is reviewed like a baseline.
3. **Contrast rule.** For every theme and registry pair, Node resolves each expression from
   the theme's generated declarations, composites the layers as axe does and requires
   4.5:1 for normal text and 3:1 for large text (axe passes only above the threshold),
   4.5:1 for placeholders and 3:1 for room icons. A text is large only if it is large at the
   probe-stress sizes and at the geometry floor (`GEOMETRY_FLOOR`), so a theme with smaller
   headings cannot inherit a laxer threshold.
4. **Geometry limits.** Each theme's geometry slots must not exceed the probe-stress
   theme's, and its text sizes and weights must not fall below the floor. Each font slot
   sets a reference string, in the slot's case and spacing, no wider than the probe-stress
   theme's same slot. A failure names the slot and says to widen the probe-stress theme,
   which re-runs the sweep at the new limit.
5. **Specimen backstop.** Each theme's specimen at both widths, with its real colours and
   geometry: axe color-contrast, clipped text and overflow. One test per theme.

## Alternatives Considered

- Keep the per-theme walk and add workers: the cost stays linear in themes and already
  needed six workers for seven brands.
- Sample a few screens per theme: misses composition on the screens left out, and the
  choice of sample would drift from the app.
- Derive pairs from the stylesheets statically: cascade, inheritance, stacking and
  component libraries make that unreliable; recording real usage in a browser is simpler
  and exact for the probe-stress theme.

## Consequences

- Positive: the sweep's cost depends on screens, not themes. A theme adds a contrast-rule
  row, a geometry test and a specimen test (about 15 seconds locally). The contrast rule
  runs in milliseconds for hundreds of themes.
- Negative: the guarantees rest on three conditions. The slot set must stay closed (enforced
  by `tokens:check`); the registry must come from real usage (enforced by the drift check);
  every theme must stay inside the geometry limits (enforced per theme). Composition that
  depends on enum slots (Home placement, hero surface, tab edge) is swept only in the
  probe-stress theme's choice; the screenshot tier still covers Home per theme, and the
  derived properties those enums select are resolved per theme by the contrast rule.
- Negative: the registry changes when a component's background stack changes, and that
  change needs a reviewed regeneration.
- Follow-ups: run only the themes a pull request changes (the per-theme tests allow it);
  move to single-mode themes, which needs no change here because pairs are recorded per
  base mode.
