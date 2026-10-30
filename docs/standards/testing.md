# Testing Standard

## TL;DR

- Canonical command: `pnpm run ci` (runs `ci:tests` + `ci:docs`).
- Non-Docker suite: `pnpm run test:format && pnpm run test:lint && pnpm run test:typecheck && pnpm run test:unit && pnpm run test:build && pnpm run test:e2e && pnpm run test:docs`.
- Unit tests for pure logic; integration tests for behavior and DB.
- DB tests run in isolated Postgres via Testcontainers; migrations auto-apply; state resets per suite.

## Test Types

- Unit: pure functions, no IO.
- Integration (API/DB): use Testcontainers Postgres; apply migrations from `database/migrations`; truncate + restart identities between tests.
- Visual: Playwright screenshot comparison of the screen matrix (see Visual Tests below).
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

A deterministic screenshot suite that proves refactors (design tokens, themes, brands) change no pixels, and produces the images a design review looks at.

- Run: `pnpm run test:visual` (compare) and `pnpm run test:visual:update` (rewrite baselines). Requires Docker and `pnpm --filter @fantasy-oscars/shared build`.
- How it works: the API, a Postgres Testcontainer and the production web build run on the host as in the e2e suite (ports 4273/4274); only Chromium runs in the official `mcr.microsoft.com/playwright:v<version>-noble` image (version taken from the installed `@playwright/test`, platform forced to `linux/amd64`), reached over Playwright's `run-server` websocket with the host loopback exposed to it. This keeps baselines identical on macOS and on the Linux CI runner. On Apple silicon the amd64 image is emulated, so a local run takes many minutes; CI is native and faster. The config refuses to run without the container, so baselines cannot be produced by a host browser.
- Matrix: `tests/visual/matrix.ts` is one table of screens, plus the modes (light, dark), viewports (1280x800, 390x844) and brands dimensions. Add a screen by adding a row. Snapshots are `__screenshots__/<screen>/<mode>-<viewport>.png` (a brand other than `default` prefixes the file name). Tall pages are captured at full width up to 2400px high.
- Data: `tests/visual/support/seed.ts` builds a fixed dataset: a six-person league with a two-letter and a very long username, a completed draft with winners, a live draft where `avery` is on the clock, a pending season, an admin, and a user with no leagues. All timestamps are explicit. The browser clock is frozen at 2035-02-10T18:00Z, locale en-US, timezone UTC; animations, transitions and the caret are off; fonts and images are awaited before each capture; any request that leaves the machine fails the test. Material Symbols are served from a pinned subset in `tests/visual/fixtures/`. When the app starts using a new icon, add its name to `material-symbols-icons.txt`, run `node tests/visual/fixtures/fetch-icon-font.mjs`, and update the baselines.
- Zero tolerance: a single differing pixel fails. A flaky screenshot is a bug (see Flake Policy); fix the cause (add a wait, pin the data) rather than raising a threshold or masking.
- When to update baselines: only when the visual change is intended (a restyle, new content on a screen). A refactor meant to be pixel-neutral must pass without updating. Run `pnpm run test:visual:update`, review every changed PNG in the diff, and commit baselines in the same PR as the change.
- Reviewing diffs: on failure open `playwright-report/visual/index.html` (`pnpm exec playwright show-report playwright-report/visual`); each failing screenshot has expected, actual and diff views plus a slider. In CI the same report and `test-results/visual` are uploaded as the `visual-report` artifact. GitHub also renders PNG changes in a PR with 2-up, swipe and onion-skin modes.
- CI: the `visual` job in `.github/workflows/ci.yml` runs on every PR. It is not part of `pnpm run ci`, which stays runnable without a multi-minute, Docker-container browser pass.

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
