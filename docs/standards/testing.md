# Testing Standard

## TL;DR

- Canonical command: `pnpm run ci` (runs `ci:tests` + `ci:docs`).
- Before a PR: `pnpm run ci:affected` runs what GitHub CI will run for the diff, visual tiers included (see "CI selection by diff").
- Non-Docker suite: `pnpm run test:format && pnpm run test:lint && pnpm run test:typecheck && pnpm run test:unit && pnpm run test:build && pnpm run test:e2e && pnpm run test:docs`.
- Unit tests for pure logic; integration tests for behavior and DB.
- DB tests run in isolated Postgres via Testcontainers; migrations auto-apply; state resets per suite.

## Test Types

- Unit: pure functions, no IO.
- Integration (API/DB): use Testcontainers Postgres; apply migrations from `database/migrations`; truncate + restart identities between tests.
- Visual: Playwright suite in a pinned browser with three tiers: measured component tolerances, rule-based assertions (both baseline-free) and screenshots of Home and one sample card (see Visual Tests below).
- E2E: Playwright. Global setup starts a Postgres Testcontainer (needs Docker), the API, and a production web build pointed at it (ports 4173/4174, override with `E2E_WEB_PORT`/`E2E_API_PORT`). Tests: a web smoke check, a two-user flow (invite, draft, winners, standings), password reset, the Circuit admin editor, season creation and a four-player season draft (a timed-out pick drafted from the queue, an empty queue made up in the supplemental round, a dropped and restored socket). The e2e stack runs the draft sweeper so pick clocks expire (the visual stack does not, so seeded screens stay put); global setup also seeds an active Circuit with twelve contenders and the draft spec's four players. TMDB is not reachable, so that spec answers film search in the browser from the seeded films.

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
- Web bundle size budget (run after `pnpm run build`; budgets in `apps/web/bundle-budget.json`, rules in "Bundle budgets" below): `pnpm run bundle:check`
- Integration tests only (Docker required): `pnpm run test:integration`
- Integration tests (bail early): `pnpm run test:integration:bail`
- E2E tests (requires Docker; `pnpm --filter @fantasy-oscars/shared build` first): `pnpm run test:e2e`. Ports default to 4173 (web) and 4174 (API); `E2E_WEB_PORT`/`E2E_API_PORT` override them. If either port is already in use the run stops within seconds, before the database or build start, with a message naming the port and how to free it (`lsof -nP -iTCP:<port> -sTCP:LISTEN`) or move it; the harness never stops a process it did not start. Readiness counts only the stack's own servers (the web build serves a per-run token file that setup reads back; the API must still be running after `/health` answers), and both servers stop with the run, including when it is killed.
- Install Playwright Chromium (one-time per machine): `pnpm run test:e2e:install`
- API tests only: `pnpm run test --workspace @fantasy-oscars/api`
- Web tests only: `pnpm run test --workspace @fantasy-oscars/web`
- Typecheck tests too: `pnpm run typecheck --workspace @fantasy-oscars/api` (includes test TS config).

## Visual Tests

Three tiers, each testing one thing (rationale: [ADR 0004](../adr/0004-measured-component-tolerances.md), which supersedes the screenshot tiers of [ADR 0003](../adr/0003-layered-visual-testing.md)). A brand's look is measured on components, not photographed on every screen.

- **Tolerances** (`tolerances.spec.ts`, `tolerances/`, no baselines): `/__specimen` for every brand x mode x viewport (desktop 1280, phone 390). Each representative component is measured from the DOM (`getComputedStyle`, `getBoundingClientRect`, the painted font) against ranges and relations in one table, `tests/visual/tolerances/spec.ts`.
- **Assertions** (`assertions.spec.ts`, `assertions/`, no baselines): no overflow, clipping, overlap, small targets or contrast failures anywhere. Every screen checked once in a test-only probe-stress theme; every theme checked through rules on its values ([ADR 0008](../adr/0008-rule-based-visual-assertions.md)). See "Assertion tier" below.
- **Screenshots** (`screens.spec.ts`, `baselines.spec.ts`): only what a person judges by eye. `home-logged-in` for every brand x mode x viewport (28), and the sample card (`data-specimen-sample` on the specimen: title, status chip, body, input, primary and secondary button) for every brand x mode at desktop (14): 42 baselines. `home-logged-out` is not captured; its layout and slots are Home's.
- **Tokens** (unit, `apps/web/tests/unit/brand/brandTokens.test.ts`): every slot parses and every text/background pair meets its ratio, for every brand and mode.

What this does not catch: a pixel regression outside Home and the sample card that stays in range, overflows nothing and passes contrast. Only the tolerance and assertion tiers guard those screens.

- Run: `pnpm run test:visual` (compare, all tiers) and `pnpm run test:visual:update` (rewrite baselines). Requires Docker and `pnpm --filter @fantasy-oscars/shared build`. To run one tier, use `node tests/visual/run.mjs --tier screenshots|tolerances|assertions`; CI runs them as three parallel jobs, and `pnpm run ci:affected` runs them one after another when the diff selects `visual`. To run a subset, pass a Playwright grep: `-g "tolerances noir "`, `-g "home-logged-in"`, `-g "assertions noir"`. Add `--update` to rewrite only the matching baselines. A `-g` run skips the stale-allowlist and stale-pair checks, which need every sweep cell.
- How it works: the API, a Postgres Testcontainer and the web build run on the host as in the e2e suite (ports 4273/4274); only Chromium runs in the official `mcr.microsoft.com/playwright:v<version>-noble` image (version taken from the installed `@playwright/test`, platform forced to `linux/amd64`), reached over Playwright's `run-server` websocket with the host loopback exposed to it. This keeps baselines identical on macOS and on the Linux CI runner. On Apple silicon the amd64 image is emulated, so a local run takes many minutes; CI is native and faster. The config refuses to run without the container, so baselines cannot be produced by a host browser. The visual build sets `VITE_FO_ENABLE_ALL_BRANDS` (gated brands load) and `VITE_FO_ENABLE_SPECIMEN` (the `/__specimen` route exists); production and e2e builds set neither, so the specimen is absent from the shipped bundle. A second visual run in one worktree fails at once with the busy-port message instead of sharing ports 4273/4274; set `E2E_WEB_PORT`/`E2E_API_PORT` to run two side by side.
- Matrix: `tests/visual/matrix.ts` is data. `SCREENS` rows (walked by the assertion tier), `BRANDS`, `modesOf()`, `SAMPLE_SELECTOR`, `SPECIMEN_SCREEN` and `allCaptures()` (the one list of screenshots) define everything. Modes come from the brand catalog, so a brand that declares one mode gets one. Snapshots are `__screenshots__/<screen>/<mode>-<viewport>.png` (a brand other than `default` prefixes the file name). A baseline that `allCaptures()` does not name, or a capture without a baseline, fails `baselines.spec.ts`.
- Data: `tests/visual/support/seed.ts` builds a fixed dataset: a six-person league with a two-letter and a very long username, a completed draft with winners, a live draft where `avery` is on the clock, a pending season, an admin, and a user with no leagues. All timestamps are explicit. The browser clock is frozen at 2035-02-10T18:00Z, locale en-US, timezone UTC; animations, transitions and the caret are off; fonts and images are awaited before each capture; any request that leaves the machine fails the test. Material Symbols are served from a pinned subset in `tests/visual/fixtures/`. When the app starts using a new icon, add its name to `material-symbols-icons.txt`, run `node tests/visual/fixtures/fetch-icon-font.mjs`, and update the baselines.
- Near-zero tolerance for screenshots: `maxDiffPixels` is 0, so one pixel beyond the colour `threshold` (0.04) fails. The threshold absorbs Chromium's rendering noise on text edges, which varies by a few colour levels between CI runners; a change of about 10 levels or more still fails. Any other flaky screenshot is a bug (see Flake Policy); fix the cause (add a wait, pin the data) rather than raising the threshold or masking.

### Tolerance tier

The specimen stamps `data-spec="<component>[:<variant>]"` and `data-spec-state` on real components (`apps/web/src/features/specimen/hooks.ts`); the tier finds a component by those, never by a CSS class. Each entry in `tolerances/spec.ts` names a hook, the states it must show and its checks:

- **Values** (height, width, touch target, padding, gap, border width, radius, font size, line height, weight, letter spacing, icon size) as a range, an equality or a set.
- **Painted font:** the face Chromium paints is the first family of the brand slot the component should read, so a fallback fails.
- **Contrast** of text and icons, 3:1 for control boundaries, and a focus ring of at least 2 px at 3:1 against its surface.
- **State difference:** hover, focus, selected and disabled must render differently from default.
- **Relations** across a family: variants share a height, input height equals button height, headings step down by at least 1.15x or a weight step, padding is on the spacing scale, and radius equals the contract slot it should read (a literal that bypasses the token fails).

Ranges come from the token contract (`theme/brands/contract.ts`), `docs/architecture/brands.md` and the prescriptions, resolved per brand at run time from the page's custom properties. A brand inside the contract passes without editing the spec. A bound the contract does not give carries a `source` saying where it comes from. A failure reads `<brand>/<mode>/<viewport> · <component>:<state> · <property>: measured X, expected Y`.

- **Add a component:** give the specimen a sample, stamp a hook for it in `hooks.ts` (a `CELL_TARGETS` entry if it sits in a `Cell`), and add an entry to `spec.ts` with its states and checks. A hook the spec lists but the specimen lacks fails ("the specimen drifted").
- **Add a brand:** nothing in the spec. The runner reads brands and modes from the catalog.
- **Prove a check bites:** inject a throwaway rule with `VISUAL_TOLERANCE_MUTATION='[data-spec="button:primary"]{height:24px !important}' node tests/visual/run.mjs --tier tolerances -g "tolerances default desktop"` (or `VISUAL_TOLERANCE_MUTATION_FILE`). The tier must fail with a readable message. A check no mutation can trip is deleted or fixed. `VISUAL_TOLERANCE_DUMP=<dir>` writes each cell's raw measurements.
- **Allowlist pins:** `tolerances/allowlist.ts` holds findings that exist today. Each entry names the component, property, modes and viewports, the exact measured value per brand (`pins`), a reason, a date and a named follow-up. Nothing is wildcarded: a value not pinned still fails, so a further regression is caught. An entry that no longer matches a finding fails the run when every cell ran; delete it when you fix the app. Never add an entry for a failure your change introduced.

### Assertion tier

Screens are checked once and themes through rules ([ADR 0008](../adr/0008-rule-based-visual-assertions.md)). A theme is one brand in one mode (`assertions/themes.ts`); a brand with one mode is one theme. Four parts, all in `assertions.spec.ts`:

- **Sweep** (`sweep <viewport> part <n> of 3`, six cells): every row of `SCREENS`, the specimen and the draft stress data (`stressRuns.ts`: 12 seats, 61-character names) at desktop and phone width, painted in the probe-stress theme (`fixtures/probeStressTheme.ts`) over the default brand's page. That theme takes the draft room stress brand (`fixtures/stressBrand.ts`) and raises every geometry slot to the largest value a shipped theme uses (40/32/22 px headings, uppercase labels, display, nav and wordmark, 0.12em label tracking, 148 px hero, all decorations, Cinzel display, Montserrat text, IBM Plex Mono figures). Its colours are probes: every colour property of the brand layer has its own value, so a computed colour maps back to the property behind it. Each screen loads once per viewport and runs the layout checks once (`scanLayout` in `screenScan.ts`, checks in `pageChecks.ts`): document `scrollWidth <= innerWidth`; elements that clip (overflow hidden or clip) text without both truncating (ellipsis or line clamp) and exposing the full text (`title`, `aria-label`); visible buttons, links and inputs that overlap by more than 1px (stacking by design is exempt: fixed or sticky chrome over scrolling content, an open tooltip over the page, an open menu, a number input's steppers); at 390px, interactive elements under 44x44 (inline links in running text are exempt). Clipped text means a glyph reaches past the box, not that `scrollWidth` exceeds `clientWidth`. Draft screens also get the room geometry checks (`roomFindings`), the specimen the tooltip chip check (`tooltipChipFindings`, `room-tip-chip`) and the countdown the tab width check. Then, where the old tier ran axe (every screen at desktop, the specimen at both widths), it records contrast pairs (`pairs.ts`): for every text node axe's `color-contrast` rule evaluates, every shown placeholder (axe skips them) and every draft room icon and punchout circle, the foreground expression, the background expressions under it down to the root and the size bucket (large only if large at the probe-stress sizes and at `GEOMETRY_FLOOR`). axe runs once per screen; the colours are read in light, then the page repaints in dark in place (`switchAppearance` writes `fo:test-appearance` and the app's colour scheme manager repaints on the `storage` event) and they are read again, because some app rules are scoped to one mode. Every colour is read under a second palette too: one that does not change is a constant, one that changes must decode to the same expression under both, or the cell fails with `contrast-probe`. Text axe reports as incomplete (over images, gradients or overlaps) is listed as unchecked.
- **Pair registry** (`tests/visual/assertions/pairs.json`, committed): every pair the sweep observes, with the modes and screens it was seen on. A pair the registry lacks fails the sweep cell (`contrast-registry`); a registry pair no screen uses any more fails the full run. Regenerate with `node tests/visual/run.mjs --tier assertions --update` (a full run; a `-g` run refuses) and review the diff like a baseline.
- **Contrast rule** (`contrast rule <slug/mode>`, `contrastRule.ts`, no browser): every registry pair seen in the theme's mode, resolved from the theme's generated declarations (`colors.ts`), composited as axe does (channel rounding, white under everything) and held to 4.5:1 for normal text and 3:1 for large text (above the threshold, as axe), 4.5:1 for placeholders and 3:1 for room icons. Failures name the theme, the pair, its ratio and an example screen. Pair-rule exceptions live in `CONTRAST_EXCEPTIONS` (none).
- **Geometry limits** (`geometry limits <slug/mode>`, `geometryLimits.ts`): every geometry slot at most the probe-stress theme's (sizes, tracking, word spacing, case, border width, radii, double rules, decorations, room ring and drop), text sizes and weights at least `GEOMETRY_FLOOR`, and every font slot setting the reference string (in the slot's case and spacing, at 100 px) no wider than the probe-stress theme's same slot. A failure names the slot: widen the probe-stress theme (the sweep then re-runs every screen at the new limit), never skip the check.
- **Specimen backstop** (`specimen <slug/mode>`): the specimen at both widths in the theme's real colours and geometry: axe `color-contrast` and the placeholder pairs, clipped text and overflow.

axe is injected from `axe-core` and called in the page directly, not through the `@axe-core/playwright` wrapper, whose per-call setup cost about a second a scan. One extra test measures the working fonts (width check); see "Draft room" in `docs/architecture/brands.md`. Montserrat is a pinned file in `tests/visual/fixtures/` (SIL Open Font License 1.1; `node tests/visual/fixtures/fetch-stress-font.mjs` rebuilds it). At phone width the specimen renders only the header variants the app produces there.

- **Allowlist rule:** `tests/visual/assertions/allowlist.ts` lists layout failures of the sweep that already existed, each with a check, screen, viewport, part of the element description, a reason and a date. A new failure is never added to it: fix the change. An entry that no longer fails fails the run (delete it when you fix the app). Keep entries specific; no blanket per-screen disables. Contrast exceptions follow the same rule per theme.
- The touch-target list is printed at the end of a run and written to `test-results/visual/assertions/touch-targets.txt`. Entries for it are per component family.

### Updating baselines and screenshots

- **Restyle a brand:** its Home and sample-card baselines change; the tolerance tier tells you if a component left its range.
- **Change Home:** the `home-logged-in` baselines for every brand, mode and viewport.
- **Change the sample card or a component in it:** the `sample-card` baselines.
- **Add a brand:** its tokens (the token tests cover them) and an entry in `BRANDS` (its modes come from the brand catalog in `packages/shared/src/brands.ts`), then generate its Home cells (two modes x two viewports) and sample cards (two modes). The tolerance and assertion tiers need no files: the theme gets contrast-rule, geometry and specimen tests, and a geometry failure means the probe-stress theme must widen first.
- **Add a screen:** one row in `SCREENS`. It joins the sweep automatically and has no screenshot unless it is Home; regenerate the pair registry if it paints a pair the registry lacks.
- When to update baselines: only when the visual change is intended (a restyle, new content on Home). A refactor meant to be pixel-neutral must pass without updating. Run `-g <id> --update` for the cells you changed (or `pnpm run test:visual:update`), then rerun without `--update`, review every changed PNG in the diff, and commit baselines in the same PR as the change. Only cells in scope should change.
- Reviewing diffs: on failure open `playwright-report/visual/index.html` (`pnpm exec playwright show-report playwright-report/visual`); each failing screenshot has expected, actual and diff views plus a slider. In CI the same report and `test-results/visual` are uploaded as an artifact by each visual job (`visual-report`, `visual-tolerances-report`, `visual-assertions-report`). GitHub also renders PNG changes in a PR with 2-up, swipe and onion-skin modes.

### Bundle budgets

`pnpm run bundle:check` measures gzip sizes of the web build (`.github/scripts/bundle-budget.mjs`) against `apps/web/bundle-budget.json`:

- **Entry** (`entryJsGzipKb`): the `index` chunk plus the `vendor` chunk, which is what every first visit downloads. Target: the measured value, rounded up, plus 10 kB headroom.
- **Largest route chunk** (`largestRouteChunkGzipKb`, 60 kB): the biggest chunk that is not the entry, vendor, admin or admin preview chunk. Route groups load on navigation (`LazyRoute`), so a route stays small.
- **Admin chunk** (`adminChunkGzipKb`): `AdminRoutes-*`. Target: the measured value plus 15 kB.
- Reported without a budget: the admin preview chunk (`MarkdownPreview-*`), total JS and total CSS.
- Structural checks that fail the run: the markdown parser (`micromark`) appears in any chunk other than `MarkdownPreview-*`, or any chunk inlines an SVG as a data URI (avatars are files; `assetsInlineLimit` excludes `src/assets/openmoji/animals/`).

The `vendor` chunk is every `node_modules` module the entry reaches through static imports (React, React Router, Mantine, Floating UI, TanStack Query and what they import), set in `apps/web/vite.config.ts`. It never imports app code, so an app-only change leaves its file name unchanged and browsers keep it cached across deploys; only a dependency change renames it.

Raising a budget needs a line in the PR saying what grew and why. A budget is not raised to make a build pass: move the code behind a lazy route first. A budget that has slack well above 10 kB (entry) or 15 kB (admin) after a size drop is lowered to the target in the same PR.

### CI selection by diff

`.github/scripts/affected.mjs` holds one table (`TABLE`) from changed paths to groups: `checks` (format, lint, typecheck, unit), `api` (integration), `web` (build, bundle budget), `visual`, `e2e` and `docs`. The first matching row wins, and a path no row matches selects everything. In short:

- `docs/**`, `README.md`: docs only.
- `apps/api/**`: checks, api, e2e. `apps/web/**`: checks, web, visual, e2e.
- `tests/visual/**`: checks, visual. `tests/e2e/**`: checks, e2e. `tests/unit/**`: checks.
- `packages/**`, `database/**`, `.github/**`, `infra/**`, `tooling/**`, root config and the lockfile: everything.

In `.github/workflows/ci.yml` a `changes` job computes the groups and the other jobs (`checks`, `integration`, `build`, `e2e`, `docs`, `visual-screenshots`, `visual-tolerances`, `visual-assertions`) run only when theirs is selected. An always-running `gate` job fails if any of them failed or was cancelled, or if `changes` did not succeed, and passes when each succeeded or was skipped. Pushes to `main` and the merge queue select everything. Branch protection requires only `gate`; add it under the `main` rule's required status checks after it has run once on a PR, and remove the individual checks it replaces.

Locally, `pnpm run ci:affected` runs the same selection against `origin/main` and, for each selected group, the same commands as that group's CI jobs, with the same `env` (`--dry-run` prints them without running them). A command several groups share, such as the shared package build, runs once, and the run stops at the first failure. When `visual` is selected it runs the three visual tiers one after another in the Playwright container, with CI's worker counts (Docker must be running): about 3 minutes on an Apple silicon laptop (tolerances 51 s, assertions 78 s, screenshots 59 s). More workers made screenshots faster (45 s at 8) but produced captures drawn in fallback fonts, so the local counts match CI's. Before a PR, `pnpm run ci` passes and, when the diff selects `visual`, so does `pnpm run ci:affected`; together they are the definition of done. To change the table, edit `TABLE` and its test, `tests/unit/tooling/affected.test.mjs`.

**Parity rule.** `COMMANDS` in `.github/scripts/ci-affected.mjs` lists the local commands per group; `tests/unit/tooling/ci-parity.test.mjs` (part of `test:unit`) reads `.github/workflows/ci.yml` and fails when a group `affected.mjs` can select has no local command or no CI job, or when a group's local commands differ from the `run` steps (and their `env`) of its CI jobs. A difference that is meant is listed in `INTENTIONAL_DIFFERENCES`, next to `COMMANDS`, with one reason; a listed difference that no longer exists also fails. So a change to a CI job's commands comes with the same change to `COMMANDS`, or a listed reason.

**Repeated e2e specs.** When `e2e` is selected, `ci:affected` also runs every e2e spec file the diff adds or changes three times, with no retries and one worker (as in CI; the specs share personas, so parallel copies of a spec collide): `pnpm exec playwright test --repeat-each=3 --retries=0 --workers=1 <specs>`. CI retries a failed e2e test once, which hides a spec that passes only some of the time; this step is where such a spec should fail. It cannot catch every order-dependent bug: a bug that needs a rare seat order (about 1 in 16 for the strict-mode locator bug fixed in #447) is caught by three repeats only about 1 time in 5, so make such specs deterministic instead of relying on repeats.

## Tips

- Make API logs readable during tests (if you need them):
  - Default is silent during tests (`LOG_LEVEL=silent`).
  - Opt in to readable request logs: `LOG_LEVEL=info LOG_FORMAT=pretty pnpm run test:integration --workspace @fantasy-oscars/api`
  - If you need error stack traces from the API during tests: set `LOG_STACK=1`

## Unit test timing

The web unit config sets `testTimeout` to 15 s: jsdom-heavy files (`App.test.tsx`, the admin screens) take about 5 s normally and 30 s or more when the cores are contended. `pnpm -r test:unit` runs the workspaces in parallel, so the web and API unit configs cap `maxWorkers` at `"50%"` of the cores each; the integration config keeps its cap of 3 (one Postgres container per file). A test that needs more than 15 s is slow on its own and should be fixed, not given a longer timeout.

## Isolation Rules

- Each integration test suite: fresh DB via Testcontainers.
- After each suite: truncate tables and restart identities.
- No shared state across test runs.

## Flake Policy

- Flakes are bugs; investigate root cause, don’t mute. A job that passes only on a re-run is a flake to fix, not a green run.
- Start each attempt of an async call only when it is awaited: an array of promises started together and awaited one by one leaves the later ones unawaited, and a rejection among them is reported as an unhandled error (the cause of a `circuitWaiverClaims` failure on `main`).
- DB startup failures: check Docker access for Testcontainers.

## Links

- Data/migrations: [../architecture/data.md](../architecture/data.md)
- Runbook (DB): [../runbooks/database.md](../runbooks/database.md)
