# Testing Standard

## TL;DR

- Canonical command: `pnpm run ci` (runs `ci:tests` + `ci:docs`).
- Non-Docker suite: `pnpm run test:format && pnpm run test:lint && pnpm run test:typecheck && pnpm run test:unit && pnpm run test:build && pnpm run test:e2e && pnpm run test:docs`.
- Unit tests for pure logic; integration tests for behavior and DB.
- DB tests run in isolated Postgres via Testcontainers; migrations auto-apply; state resets per suite.

## Test Types

- Unit: pure functions, no IO.
- Integration (API/DB): use Testcontainers Postgres; apply migrations from `database/migrations`; truncate + restart identities between tests.
- Visual: layered Playwright suite in a pinned browser: layout and brand screenshots, a component specimen per brand, and a baseline-free assertion tier (see Visual Tests below).
- E2E: Playwright. Global setup starts a Postgres Testcontainer (needs Docker), the API, and a production web build pointed at it (ports 4173/4174, override with `E2E_WEB_PORT`/`E2E_API_PORT`). Tests: a web smoke check and a two-user flow (invite, draft, winners, standings).

## Where Tests Live

- Repo-wide invariants (tooling, migration ordering, escape-hatch enforcement): `tests/unit/tooling/`
- Web unit tests: `apps/web/tests/unit/`
- API unit + integration tests: `apps/api/tests/unit/` and `apps/api/tests/integration/`
- Shared package unit tests: `packages/shared/tests/unit/`
- E2E tests (Playwright): `tests/e2e/` (linted via `pnpm run lint:e2e`)
- Visual tests: `tests/visual/` (config `playwright.visual.config.ts`; baselines in `tests/visual/__screenshots__/`)

## How to Run

- Full suite: `pnpm run ci` (matches CI).
- Tests only: `pnpm run ci:tests`
- Docs only: `pnpm run ci:docs`
- Non-Docker checks: `pnpm run test:unit` (plus `test:format`, `test:lint`, `test:typecheck`, `test:build`, `test:docs`).
- Web bundle size budget (run after `pnpm run build`; budgets in `apps/web/bundle-budget.json`): `pnpm run bundle:check`
- Integration tests only (Docker required): `pnpm run test:integration`
- Integration tests (bail early): `pnpm run test:integration:bail`
- E2E tests (requires Docker; `pnpm --filter @fantasy-oscars/shared build` first): `pnpm run test:e2e`
- Install Playwright Chromium (one-time per machine): `pnpm run test:e2e:install`
- API tests only: `pnpm run test --workspace @fantasy-oscars/api`
- Web tests only: `pnpm run test --workspace @fantasy-oscars/web`
- Typecheck tests too: `pnpm run typecheck --workspace @fantasy-oscars/api` (includes test TS config).

## Visual Tests

Four layers plus unit-level token tests, each testing one thing (rationale: [ADR 0003](../adr/0003-layered-visual-testing.md)). A screen's layout does not depend on the brand, and a brand's look does not depend on the screen, so the suite does not multiply them.

- **Layout** (`screens.spec.ts`): every screen's structure, pixel for pixel. Every `SCREENS` row in the default brand (refined-gold), light mode, both viewports; dark only for `DARK_KEY_SCREENS`.
- **Specimen** (`screens.spec.ts`, `features/specimen`): every brand's look on every component and state. `/__specimen` per brand: both modes at desktop, the primary mode at phone.
- **Brand screens** (`screens.spec.ts`): where brands differ per screen. `BRAND_SCREEN_IDS` (Home logged out and in, live draft) x every brand x primary mode x both viewports.
- **Assertions** (`assertions.spec.ts`, `assertions/`): no overflow, clipping, overlap, small targets or contrast failures anywhere. Every screen and the specimen x every brand x both modes x both viewports; no baselines.
- **Tokens** (unit, `apps/web/tests/unit/brand/brandTokens.test.ts`): every slot parses and every text/background pair meets its ratio, for every brand and mode.

- Run: `pnpm run test:visual` (compare, all layers) and `pnpm run test:visual:update` (rewrite baselines). Requires Docker and `pnpm --filter @fantasy-oscars/shared build`. To run one half, use `node tests/visual/run.mjs --tier screenshots` (baseline comparisons and the orphan check) or `--tier assertions` (the assertion tier with the stale-allowlist judgement); CI runs them as two parallel jobs. To run a subset, pass a Playwright grep to the runner: `node tests/visual/run.mjs -g "specimen"`, `-g "home-logged-in"`, `-g "assertions noir"`. Add `--update` to rewrite only the matching baselines. A `-g` run skips the stale-allowlist check, which needs all 21 assertion cells.
- How it works: the API, a Postgres Testcontainer and the web build run on the host as in the e2e suite (ports 4273/4274); only Chromium runs in the official `mcr.microsoft.com/playwright:v<version>-noble` image (version taken from the installed `@playwright/test`, platform forced to `linux/amd64`), reached over Playwright's `run-server` websocket with the host loopback exposed to it. This keeps baselines identical on macOS and on the Linux CI runner. On Apple silicon the amd64 image is emulated, so a local run takes many minutes; CI is native and faster. The config refuses to run without the container, so baselines cannot be produced by a host browser. The visual build sets `VITE_FO_ENABLE_ALL_BRANDS` (gated brands load) and `VITE_FO_ENABLE_SPECIMEN` (the `/__specimen` route exists); production and e2e builds set neither, so the specimen is absent from the shipped bundle.
- Matrix: `tests/visual/matrix.ts` is data. `SCREENS` rows, `BRANDS`, `PRIMARY_MODE`, `DARK_KEY_SCREENS`, `BRAND_SCREEN_IDS` and `allCaptures()` (the one list of screenshots) define everything. Snapshots are `__screenshots__/<screen>/<mode>-<viewport>.png` (a brand other than `default` prefixes the file name). Tall pages are captured at full width up to 2400px high (the specimen, 12000px). A baseline that `allCaptures()` does not name, or a capture without a baseline, fails `baselines.spec.ts`.
- Data: `tests/visual/support/seed.ts` builds a fixed dataset: a six-person league with a two-letter and a very long username, a completed draft with winners, a live draft where `avery` is on the clock, a pending season, an admin, and a user with no leagues. All timestamps are explicit. The browser clock is frozen at 2035-02-10T18:00Z, locale en-US, timezone UTC; animations, transitions and the caret are off; fonts and images are awaited before each capture; any request that leaves the machine fails the test. Material Symbols are served from a pinned subset in `tests/visual/fixtures/`. When the app starts using a new icon, add its name to `material-symbols-icons.txt`, run `node tests/visual/fixtures/fetch-icon-font.mjs`, and update the baselines.
- Zero tolerance: a single differing pixel fails. A flaky screenshot is a bug (see Flake Policy); fix the cause (add a wait, pin the data) rather than raising a threshold or masking.

### Assertion tier

One page per cell loads its screens once (21 cells: per brand, one phone cell and the desktop screens cut into two halves, so no cell runs much past a minute; the assertion job runs 6 workers, the screenshot job 4), checks it in light, repaints it in dark in place (the stored colour scheme changes and the app repaints on the `storage` event) and checks it again. Checks (`tests/visual/assertions/pageChecks.ts`): document `scrollWidth <= innerWidth`; elements that clip (overflow hidden or clip) text without both truncating (ellipsis or line clamp) and exposing the full text (`title`, `aria-label`); visible buttons, links and inputs that overlap by more than 1px (stacking by design is exempt: fixed or sticky chrome over scrolling content, an open menu, a number input's steppers); at 390px, interactive elements under 44x44 (inline links in running text are exempt); axe `color-contrast` with zero violations. Axe runs on every screen at desktop width in both modes, and on the specimen at both widths: contrast does not depend on width, so this is a deliberate reduction from every screen x viewport. Clipped text means a glyph reaches past the box, not that `scrollWidth` exceeds `clientWidth` (trailing letter-spacing and line-box rounding do not count). At phone width the specimen renders only the header variants the app produces there.

- **Allowlist rule:** `tests/visual/assertions/allowlist.ts` lists failures that already existed, each with a check, screen, brand/mode/viewport scope, part of the element description, a reason and a date. A new failure is never added to it: fix the change. An entry that no longer fails fails the run (delete it when you fix the app). Keep entries specific; no blanket per-screen disables.
- The touch-target list is printed at the end of a run and written to `test-results/visual/assertions/touch-targets.txt`. Entries for it are per component family.

### Updating each layer

- **Add a screen:** add one row to `SCREENS`. It joins the layout tier (about two baselines: light desktop and phone) and the assertion tier automatically. Run `-g <screen-id> --update`, then without `--update`. Add it to `DARK_KEY_SCREENS` or `BRAND_SCREEN_IDS` only if dark mode or the brand changes its structure.
- **Add a brand:** add its tokens (and the token tests cover them), an entry in `BRANDS` and `PRIMARY_MODE`, then generate its specimen captures (3: both desktop modes, primary mode phone) and its Home and draft captures (6). Assertions cover the rest with no files.
- **Change a component or its states:** update the specimen section for it, and the specimen baselines for the affected brands.
- **Restyle a brand:** its specimen captures and its Home and draft captures change; layout-tier baselines change only for the default brand.
- **Change a layout:** layout-tier baselines for the affected screens; the assertion tier tells you if it broke another brand.
- When to update baselines: only when the visual change is intended (a restyle, new content on a screen). A refactor meant to be pixel-neutral must pass without updating. Run `pnpm run test:visual:update`, review every changed PNG in the diff, and commit baselines in the same PR as the change.
- Reviewing diffs: on failure open `playwright-report/visual/index.html` (`pnpm exec playwright show-report playwright-report/visual`); each failing screenshot has expected, actual and diff views plus a slider. In CI the same report and `test-results/visual` are uploaded as the `visual-report` artifact. GitHub also renders PNG changes in a PR with 2-up, swipe and onion-skin modes.
- CI: two parallel jobs in `.github/workflows/ci.yml` run on every PR and cover every layer above: `visual` (screenshot tiers and the baseline orphan check; uploads `visual-report`) and `visual-assertions` (the assertion tier; uploads `visual-assertions-report`). Neither is a required status check. It is not part of `pnpm run ci`, which stays runnable without a multi-minute, Docker-container browser pass; the token tests are, as part of `test:unit`.

## Tips

- Make API logs readable during tests (if you need them):
  - Default is silent during tests (`LOG_LEVEL=silent`).
  - Opt in to readable request logs: `LOG_LEVEL=info LOG_FORMAT=pretty pnpm run test:integration --workspace @fantasy-oscars/api`
  - If you need error stack traces from the API during tests: set `LOG_STACK=1`

## Isolation Rules

- Each integration test suite: fresh DB via Testcontainers.
- After each suite: truncate tables and restart identities.
- No shared state across test runs.

## Flake Policy

- Flakes are bugs; investigate root cause, don’t mute.
- DB startup failures: check Docker access for Testcontainers.

## Links

- Data/migrations: [../architecture/data.md](../architecture/data.md)
- Runbook (DB): [../runbooks/database.md](../runbooks/database.md)
