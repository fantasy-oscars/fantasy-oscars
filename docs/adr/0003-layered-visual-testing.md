# ADR 0003: Layered visual testing

- Status: Accepted
- Date: 2026-11-05

## Context

The visual suite captured screens x modes x viewports x brands: 358 baselines and 8m48s for the `visual` job on `main` (CI run 41957522018). Seven brands were landing, and each new brand added about 38 baselines and each new screen about 28. Most of that is redundant:

- a screen's layout does not depend on the brand;
- a brand's look does not depend on the screen.

Pixel comparison also proves little about the properties that matter across the matrix (nothing overflows, text is readable, targets are usable). It only says "different from last time".

## Decision

Replace the brute-force matrix with layers that each test one thing, in the same pinned Docker browser:

1. **Layout tier (screenshots, one brand).** Every row of `SCREENS` in the default brand (refined-gold), light mode, both viewports; dark mode only for `DARK_KEY_SCREENS`. 65 baselines.
2. **Brand tier (specimen).** `/__specimen` renders the app's real components in every state with realistic seed data. Captured for every brand in both modes at desktop width and in the brand's primary mode at phone width: 21 baselines.
3. **Brand screens (screenshots).** Home logged out, Home logged in and the live draft room for every brand in its primary mode, both viewports: 36 baselines (6 brands x 3 screens x 2 viewports; refined-gold's are layout-tier cells).
4. **Assertion tier (no baselines).** Every screen and the specimen x every brand x both modes x both viewports, in 21 cells (per brand, one phone cell and two desktop halves): each screen loads once, is checked in light, repainted in dark in place, and checked again. Checks: no horizontal overflow; no clipped text without recourse; no overlapping interactive elements; touch targets of at least 44x44 at phone width; axe `color-contrast` = 0 violations. Axe runs on every screen at desktop width in both modes, and on the specimen at both widths, not on every screen at both viewports: contrast does not depend on width, and axe is the dominant cost of the tier. This is a deliberate deviation from running every check on every screen x viewport. Pre-existing failures live in one allowlist (`tests/visual/assertions/allowlist.ts`) with a reason and date each; a stale entry fails the run.
5. **Token tests (unit).** `apps/web/tests/unit/brand/brandTokens.test.ts` checks that every contract slot parses and every text/background pair meets 4.5:1 (3:1 for large text and UI boundaries) for every brand and mode, from one table of pairs.

A test checks that every PNG under `tests/visual/__screenshots__/` is named by the matrix, so orphan baselines cannot accumulate.

Result: 122 baselines (from 358); 124 with the Appearance screen. Adding a screen costs about two screenshots (one row); adding a brand costs its tokens, three specimen captures plus Home and draft captures.

### Two CI jobs

The screenshot tiers (plus the baseline orphan check) run as the `visual` job and the assertion tier as the `visual-assertions` job, in parallel with identical setup. Locally `pnpm run test:visual` still runs both; `node tests/visual/run.mjs --tier screenshots|assertions` runs one. The stale-allowlist judgement belongs to the assertion job, which runs all 21 cells on 6 workers (the screenshot job uses 4). Neither job is a required status check.

### In-place colour-mode switching

The app repaints when it receives a `storage` event for the test-only `fo:test-appearance` key (`{ brand, mode }`), honoured only in test builds. The assertion tier switches mode with `switchAppearance`: it writes the key, dispatches that event and emulates the media preference. (When this decision was taken the app stored the colour scheme under `mantine-color-scheme-value`; the brand picker package replaced that with the override described in `docs/architecture/brands.md`.) For three screens and the specimen in two brands at both widths, the findings after an in-place switch were identical to those from a fresh load in that mode.

### The specimen route is a build-time gate

`/__specimen` is registered only when `import.meta.env.VITE_FO_ENABLE_SPECIMEN === "1"`, behind a lazy import in a ternary, so a production build tree-shakes the page and its fixtures out. The visual build sets the flag (as it does `VITE_FO_ENABLE_ALL_BRANDS`); production builds and the e2e build do not. Proof, from step A: a production build contains no `SpecimenPage` chunk and none of the specimen's unique strings; the flagged build does.

### The specimen imports app chrome

`features/specimen` imports the real shell header, primary nav and wordmark from `app/chrome/ui`, so a feature depends on `app/`. The draft room already does the same for the site footer. The exception is accepted for a test-only screen whose purpose is to render the shipped chrome; copying the chrome would make the specimen a look-alike. At phone width the specimen shows only the header variants the app produces there (the drawer variant, logged in and out).

### The axe dependency

`@axe-core/playwright` (pinned, root devDependency) is added. Contrast cannot be checked from CSS alone on real screens: the effective background of text depends on stacking, opacity, gradients and images, which is what axe resolves from computed layout in the browser. Token tests cover the token pairs; axe covers what actually renders. It is test-only, runs with the single `color-contrast` rule, and ships nothing to users. Hand-rolling the same resolution would be a worse, unmaintained copy.

## Alternatives Considered

- Status quo (every screen in every brand and mode). Catches everything pixel-wise, but cost grows with screens x brands, takes 9 minutes, and diffs are too many to review. Rejected.
- Per-component Storybook snapshots. Isolates components well, but adds a build and a dependency, and its components are look-alikes of what ships unless every provider and the real data are reproduced. The specimen page uses the real components and shares the app's build, with no new tooling. Rejected.

## Consequences

- Positive: about a third of the baselines; faster visual job; brand changes are reviewed on one page per brand; layout regressions are caught on every brand by assertions rather than by eye.
- Negative: a component that is merely ugly in one brand in one context (valid contrast, no overflow, not in the specimen, not Home or the draft room) is no longer caught by a test. Galleries and dogfooding cover it. Pixel changes in screens other than the default brand's, Home and the draft room are not detected.
- Negative: the assertion tier needs a heuristic per check; it can produce false positives that need a documented exception in the checker or an allowlist entry.
- Follow-ups: fix allowlisted items and delete their entries; tighten touch-target families as screens are reworked.
