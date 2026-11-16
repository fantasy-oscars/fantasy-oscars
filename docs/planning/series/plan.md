# Circuit competition: audit and implementation plan

This plan covers the season-long Circuit competition described in the [product brief](brief.md) (decisions through 2026-11-14). It begins with an audit of the existing system (brief section 16, step 1), so later packages build on what the code does today rather than on what the docs say. The domain model is [ADR 0005](../../adr/0005-series-domain-model.md); sections 2–8 are the build plan, schedule and test plan, and section 9 lists the questions the owner needs to answer.

**Vocabulary (2026-11-16).** This competition was first called a Series. It is a **Circuit** in code, tables and admin screens, and players see it as a **Season**, like the single-ceremony competition ([ADR 0006](../../adr/0006-circuit-admin-defined-structure.md)). Its ceremonies, events and categories are admin-defined: the five events, the eight categories and the Guild bundle below are the default slate an admin builds, not rules. Package slugs (`series-NN-*`) keep their original names.

Every file and line reference below is against `origin/main` at `31113d91`. Paths are relative to the repository root.

## 1. Audit of the existing system

### 1.1 Ceremony lifecycle

#### What the schema allows

- `ceremony.status` started as `DRAFT, PUBLISHED, LOCKED, ARCHIVED` (`database/migrations/001_init.sql:268`). Migration 006 added `COMPLETE` between `LOCKED` and `ARCHIVED` (`database/migrations/006_ceremony_complete_status.sql:7-17`).
- The only ceremony dates are `starts_at` (the ceremony itself), `draft_locked_at`, `published_at` and `archived_at` (`database/migrations/001_init.sql:262-267`). There is no nominations date and no results date. The admin schema accepts only `starts_at` and `draft_warning_hours` (`packages/shared/src/schemas/admin.ts:329`, `:347`, `:360`).

#### What each status means in code

| Status      | Set by                                                                                                                                              | Behaviour it gates                                                                                                                                                                                                                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRAFT`     | create (column default, `001_init.sql:264`)                                                                                                         | Hidden from users (`apps/api/src/routes/ceremoniesGet.ts:39`). This is the **only** status in which categories and nominations can be edited (see below).                                                                                                                                                                                                        |
| `PUBLISHED` | `apps/api/src/routes/admin/ceremonyPublish.ts:89`                                                                                                   | Visible, and league-interactive: seasons can be created only here (`apps/api/src/routes/leagues/seasonsCreate.ts:66`, `apps/api/src/routes/seasons/leaguesSeasonsCreate.ts:67`), and so can drafts (`apps/api/src/routes/drafts/create.ts:67`). Listed by `apps/api/src/routes/ceremoniesPublished.ts:19`.                                                       |
| `LOCKED`    | the first winner entered (`apps/api/src/routes/admin/winnersUpsert.ts:93-107`) or a manual lock (`apps/api/src/routes/admin/ceremonyLock.ts:43-65`) | "Results in progress" (`apps/web/src/decisions/ceremonyWorkflow.ts:67`). Cancels every in-progress draft for the ceremony (`winnersUpsert.ts:106`, `ceremonyLock.ts:65`); blocks season and draft creation (`seasonsCreate.ts:63`, `drafts/create.ts:62`); the snapshot reports aborted drafts (`apps/api/src/services/drafting/runtimeSnapshot.ts:60`, `:170`). |
| `COMPLETE`  | finalize winners, from `LOCKED` only (`apps/api/src/routes/admin/winnersFinalize.ts:46-67`)                                                         | Results read-only (`winnersUpsert.ts:78`); the precondition for archive (`apps/api/src/routes/admin/ceremonyArchive.ts:30`); broadcast as `ceremony:finalized` with `status: "COMPLETE"` (`apps/api/src/realtime/ceremonyEvents.ts:15`, `:70`); drives "final results" in the web (`apps/web/src/decisions/draft/finalResults.ts:3`).                            |
| `ARCHIVED`  | archive (`ceremonyArchive.ts:41`) or soft delete (`apps/api/src/routes/admin/ceremonyDelete.ts:116`)                                                | Read-only (`apps/api/src/routes/admin/ceremoniesUpdate.ts:41`); still listed in the public index (`apps/api/src/routes/ceremoniesIndex.ts:19`).                                                                                                                                                                                                                  |

Content is frozen at publish. Every category and nomination write is guarded by `status !== "DRAFT"`:
`ceremonyCategoriesAdd.ts:41`, `ceremonyCategoriesClone.ts:43`, `ceremonyCategoriesReorder.ts:49`, `categoryEditionsUpdate.ts:34`, `categoryEditionsDelete.ts:31`, `nominationsCreate.ts:44`, `nominationsDelete.ts:54`, `nominationsReorder.ts:38`, `nominationContributorsAdd.ts:45`, `nominationContributorsUpdate.ts:48`, `nominationContributorsDelete.ts:40`, `nomineesUploadCeremony.ts:39` (all under `apps/api/src/routes/admin/`). Publishing also requires every category to have a nominee (`ceremonyPublish.ts:71-84`). After publish, the only nomination edit is revoke or replace by an existing nomination (`apps/api/src/routes/admin/nominationsChange.ts:25`).

#### Where the brief and the code disagree

- The brief's lifecycle is `DRAFT, PUBLISHED, ACTIVE, LOCKED, ARCHIVED` (brief section 12). The database has no `ACTIVE` and does have `COMPLETE`.
- Today's `PUBLISHED` already behaves like the brief's `ACTIVE` (seasons and drafts open), so nothing represents the brief's "visible, but no league interaction yet".
- The brief requires a ceremony to be publishable early "with only dates", with categories, nominations and winners populated progressively. The publish gate (`ceremonyPublish.ts:71-84`) and the twelve `DRAFT`-only guards above prevent that.
- Today's `LOCKED` means "results being entered" and `COMPLETE` means "results final". The brief folds both into `LOCKED` and says lifecycle status is separate from content completeness.
- The architecture docs describe yet another ordering, `Draft → Published → Locked → Complete → Archived` (`docs/architecture/data.md:10`, `docs/architecture/overview.md:9`).

#### Proposed reconciliation (one decision, one migration)

**Decision.** Adopt the brief's five statuses. Move "results finalized" out of the status column into a timestamp, `ceremony.results_finalized_at`. Content completeness then sits beside lifecycle, as the brief asks, and `COMPLETE` disappears without losing the read-only-results rule.

**Migration `021_ceremony_lifecycle_active.sql`** (the next free number on `origin/main`, after `020_app_user_appearance.sql`; renumber if another package lands a migration first), in one transaction:

1. Add `results_finalized_at timestamptz NULL`.
2. Backfill before swapping the constraint:
   - `PUBLISHED` → `ACTIVE` (existing published ceremonies already allow league interaction, so they are `ACTIVE` under the brief's meaning);
   - `COMPLETE` → `LOCKED`, with `results_finalized_at = now()`;
   - `ARCHIVED` keeps its status and gets `results_finalized_at = archived_at` when it has `ceremony_winner` rows (archive required `COMPLETE`; soft delete did not);
   - `DRAFT` and `LOCKED` are unchanged.
3. Replace `ceremony_status_check` with `DRAFT, PUBLISHED, ACTIVE, LOCKED, ARCHIVED`.

**Transitions after the change.**

| From → to                     | Action                                          | Gate                                                                |
| ----------------------------- | ----------------------------------------------- | ------------------------------------------------------------------- |
| `DRAFT → PUBLISHED`           | publish                                         | code and name only (drop the nominee check)                         |
| `PUBLISHED → ACTIVE`          | new "open for leagues" action                   | every category has a nominee (the check moved from publish)         |
| `ACTIVE`/`PUBLISHED → LOCKED` | first winner entered, or manual lock (as today) | unchanged; still cancels in-progress ceremony-specific drafts       |
| `LOCKED` (finalize)           | finalize winners                                | sets `results_finalized_at`; status stays `LOCKED`                  |
| `LOCKED → ARCHIVED`           | archive                                         | `results_finalized_at IS NOT NULL` (replaces `status = 'COMPLETE'`) |

Category and nomination edits move from `DRAFT` only to `DRAFT` or `PUBLISHED`. That is what lets an admin enter nominations on announcement day into a ceremony that Circuit leagues already see, while the ceremony-specific draft pool still freezes once the ceremony is `ACTIVE`, exactly as it freezes at publish today.

**Every code path the change touches.**

- API status reads and writes (paths under `apps/api/src/`; bare names are in `routes/admin/`): `ceremonyPublish.ts:31`, `:71-89`; `ceremonyLock.ts:43`; `winnersUpsert.ts:64`, `:78`, `:93`; `winnersFinalize.ts:39`, `:46`, `:67`; `ceremonyArchive.ts:30`; `ceremonyDraftLockStatus.ts:29`; the twelve content guards listed above; `routes/ceremoniesActive.ts:19`; `routes/ceremoniesIndex.ts:19`; `routes/ceremoniesPublished.ts:19`; `routes/leagues/seasonsList.ts:66`; `routes/seasons/leaguesSeasonsList.ts:63`; `routes/leagues/seasonsCreate.ts:63-66`; `routes/seasons/leaguesSeasonsCreate.ts:64-67`; `routes/drafts/create.ts:62-67`; `services/drafting/runtimeSnapshot.ts:170`; `realtime/ceremonyEvents.ts:15`, `:70` (payload becomes `results_finalized_at`).
- Web (paths under `apps/web/src/`; bare screen names are in `features/admin/screens/ceremonies/`, bare page names in `app/pages/admin/ceremonies/`): `decisions/ceremonyLifecycle.ts:2-10` (the ordered list `finalResults.ts:3` indexes into); `decisions/season.ts:30-33`; `decisions/ceremonyWorkflow.ts:66-68`; `decisions/admin/ceremonyWizard.ts:34`, `:102`; `decisions/draft/finalResults.ts:3`; `orchestration/draft/useDraftSocket.ts:235`; `orchestration/ceremonies/orchestration.ts:17`, `:61`; `orchestration/admin/ceremonies/winnersOrchestration.ts:224`; `AdminCeremonyHomeScreen.tsx:46`; `AdminCeremoniesLockScreen.tsx:19`; `AdminCeremoniesWinnersScreen.tsx:154`, `:280`; `AdminCeremonyWizardPage.tsx:73`; `AdminCeremonyHomePage.tsx:61`; `AdminCeremoniesLockPage.tsx:20`. The admin wizard needs one new step: "Open for leagues".
- Docs: `docs/architecture/data.md:10`, `docs/architecture/overview.md:9`, `docs/architecture/scoring.md`.
- Tests and seeds: the API factory inserts ceremonies as `DRAFT` (`apps/api/tests/factories/db.ts:47`) and eight API test files promote them with `UPDATE ceremony SET status = 'PUBLISHED'` (for example `apps/api/tests/integration/routes/drafts.integration.test.ts:59`); those become `ACTIVE`. The e2e seed does the same (`tests/e2e/support/seed.ts:125`), and the visual seed cycles through `COMPLETE` (`tests/visual/support/seed.ts:234`). Web unit tests that use `COMPLETE` (for example `apps/web/tests/unit/decisions/draftFinalResults.test.ts`) move to `results_finalized_at`.

**Not part of this migration.** Nomination and results dates are Circuit inputs (brief sections 10 and 12). They belong to the Circuit schema package, as two nullable `date` columns on `ceremony` (whole days, admin-correctable). Today nothing records when a nomination or a win was announced: `nomination` has no timestamps (`001_init.sql:746-757`), and `ceremony_winner.created_at` (`001_init.sql:300`) resets on every edit because winners are replaced by delete and insert (`apps/api/src/data/repositories/winnerRepository.ts:22-32`).

### 1.2 Draft structure, pick clock and runtime

#### Structure and clock options

- **Order types.** Only snake is accepted: the request schema pipes to `z.literal("SNAKE")` (`packages/shared/src/schemas/drafts.ts:33-37`), turn math rejects anything else (`apps/api/src/domain/draftOrder.ts:38-41`), and both draft-creation paths hard-code it (`apps/api/src/routes/drafts/create.ts:90`, `leagues/seasonsCreate.ts:138`). The database also allows `LINEAR` (`001_init.sql:408`) and ADR 0001 lists it (`docs/adr/0001-domain-model.md:25`), but nothing computes a linear order. There is no auction support anywhere.
- **Pick clock.** Free-form seconds: any number ≥ 0 (`packages/shared/src/schemas/seasons.ts:13-15`); 0 or null means untimed (`drafts/create.ts:95-98`). The UI is an on/off switch plus a number input in steps of 5, defaulting to on and 60 seconds (`apps/web/src/orchestration/seasons/leagueSeasonCreateOrchestration.ts:59-60`, `apps/web/src/features/seasons/screens/LeagueSeasonCreateScreen.tsx:202-207`). The brief's 90-second default is a new default, not a new option.
- **Sizing.** Picks per seat are derived at start from the ceremony's nomination count, `floor(nominations / seats)`, with a remainder strategy (`apps/api/src/routes/drafts/start.ts:113-136`). `league.roster_size` is a placeholder set to `max_members` (`apps/api/src/routes/leagues/leaguesCreate.ts:68`). A Circuit roster is a fixed configured size (default 16), independent of any pool.
- **Seat order.** Seats come from season members at start, shuffled with `sort(() => Math.random() - 0.5)` (`start.ts:94-98`). The order persists as `draft_seat.seat_number`, which the Circuit needs for reverse-order waiver priority and chip values.

#### Runtime pieces

- **Picks** (`apps/api/src/routes/drafts/picks.ts`): rate limited (`:47`), idempotent on `request_id` (`:83`), turn-checked inside a transaction (`:199`, `:204`), and validated against the ceremony's nominations (`:156`). Uniqueness is the constraint `UNIQUE (draft_id, nomination_id)` (`001_init.sql:1397`). The pick row requires `nomination_id NOT NULL` with a foreign key to `nomination` (`001_init.sql:477`, `:2111`).
- **Auto-draft.** There are two layers. Users pick a strategy from `RANDOM, PLAN, BY_CATEGORY, ALPHABETICAL, WISDOM` (`packages/shared/src/schemas/drafts.ts:13-19`), and the draft has its own `auto_pick_strategy` (`001_init.sql:407`, `apps/api/src/domain/autodraftStrategies.ts:6-27`), set to `RANDOM_SEED` whenever a timer is on (`drafts/create.ts:31-32`, `leagues/seasonsCreate.ts:147-148`). Resolution falls through user strategy, then draft strategy, then **always** takes the first available nomination (`apps/api/src/services/drafting/autoPick.ts:126-200`, `:243`, `:249`). The brief forbids this: Circuit auto-draft uses only the participant's queue and otherwise records a missed pick.
- **Plans (crib sheets).** These are ceremony-scoped lists of nomination ids (`database/migrations/007_draft_plans.sql:7`, `:41`), seeded from the ceremony's active nominations (`apps/api/src/routes/draftPlans/helpers.ts:17`).
- **Sweeper.** One process-wide loop takes a Postgres advisory lock (`apps/api/src/services/draftSweeper.ts:96`), selects `draft` rows whose `pick_deadline_at` has passed (`:107-117`) and calls `tickDraft` (`:124`), which calls `autoPickIfExpired` (`apps/api/src/services/drafting/tick.ts:21`). It is generic over `draft` rows.
- **Real-time and reconnect.** The `/drafts` namespace admits a socket only for a league member who is also a season member (`apps/api/src/realtime/draftNamespace.ts:91-97`). Events are versioned per draft (`UNIQUE (draft_id, version)`, `001_init.sql:1381`; increment at `apps/api/src/data/repositories/draftRepository/drafts.ts:438`) and emitted as `draft:event` (`apps/api/src/realtime/draftEvents.ts:21`). Reconnect fetches `GET /drafts/:id/snapshot` (`apps/api/src/routes/drafts/snapshotRoute.ts:10`), and the client forces a resync when it sees activity on a stale snapshot (`apps/web/src/orchestration/draft/useDraftSocket.ts:51-52`). The snapshot builds a ceremony board, winners and the wisdom benchmark (`runtimeSnapshot.ts:178`, `:220-224`). Ceremony events fan out to drafts by ceremony (`apps/api/src/realtime/ceremonyEvents.ts:46-76`). History is the `draft_event` log plus `GET /drafts/:id/export` (`apps/api/src/routes/drafts/exportRoute.ts:10`).

#### What a Circuit draft can reuse

| Reuse unchanged                                                                                                                                                                                                                                                                      | Generalise                                                                                                                                                                                                                                                                                                                                                                                          | New                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Snake turn math (`getSnakeSeatForPick`, shared); deadline and timer helpers (`apps/api/src/domain/draftPickRules.ts`); pause, resume and tick; the sweeper loop and advisory lock; event versioning and emit; idempotent `request_id`; the pick rate limiter; socket session checks. | The three hard couplings to a ceremony Season: `draft.season_id NOT NULL` (`001_init.sql:394`, one draft per season `:1916`); `draft_pick.nomination_id NOT NULL` plus `UNIQUE (draft_id, nomination_id)`; socket admission through `season_member` (`draftNamespace.ts:94`). Also the snapshot board builder, the start-time sizing and the sweeper query, if Circuit drafts live outside `draft`. | Auction drafts; a Circuit-scoped ranked queue (crib sheet and auto-draft source in one); auto-draft that never invents a pick; the missed-pick queue, supplemental opportunity and chips; durable roster ownership written by each pick; a 90-second default. |

The domain ADR (step 2) chooses between extending `draft` with a nullable Circuit foreign key and a new `circuit_draft` family sharing the pure domain code. Either way, no Circuit pick may reference a ceremony nomination.

### 1.3 League and Season membership and initialisation

- **League.** `ceremony_id` is nullable since migration 005 (`database/migrations/005_league_ceremony_nullable.sql`); `roster_size` and `max_members` live on the league (`001_init.sql:681-682`). `league_member` is unique per (league, user) with roles `OWNER, CO_OWNER, MEMBER` (`001_init.sql:1517`, `:719`).
- **Season.** A Season ties a league to one ceremony, with one `EXTANT` season per (league, ceremony) (`001_init.sql:919-929`, `:1930`). Creating one requires a `PUBLISHED` ceremony and creates a `PENDING` draft in the same transaction (`leagues/seasonsCreate.ts:63-68`, `:134-149`). Two endpoints do the same thing: `POST /leagues/:id/seasons` (`apps/api/src/routes/leagues/seasonsCreate.ts:27`) and `POST /seasons/leagues/:id/seasons` (`apps/api/src/routes/seasons/leaguesSeasonsCreate.ts:27`).
- **Membership.** `season_member` is unique per (season, user) (`001_init.sql:1605`). Membership locks once the draft leaves `PENDING`: add (`apps/api/src/routes/seasons/membersAdd.ts:47-49`), invite accept (`invitesAccept.ts:84-88`), leave (`membersLeave.ts:37`) and remove (`membersRemove.ts:39`). Two join paths skip that check: public-season join (`apps/api/src/routes/seasons/publicJoin.ts:82`) and league join (`apps/api/src/routes/leagues/join.ts:75`). The domain guard `ensureJoinAllowed` (`apps/api/src/domain/leagueMembership.ts:17-21`) is only called from its unit test. Draft start revokes pending invites and seats every current season member (`start.ts:90-98`), so a late public joiner is a member with no seat.
- **Navigation.** Web routes are ceremony-shaped: `/leagues/:leagueId/:leagueSlug/:ceremonyCode` and `/seasons/:id` (`apps/web/src/app/App.tsx:144`, `:169`).

**For the Circuit.** League and `league_member` can be reused as they are: the brief keeps Circuit and Season independent, but both hang off a league. Circuit participation needs its own membership table, because `season_member`, invites and draft seats all key on `season_id`. "Membership fixed at initialisation" should be one domain guard that every Circuit join path calls, not a check copied into each route. The Season join gap above shows what happens when it is copied.

### 1.4 Catalog, TMDB search and credits

- **Identity.** `film.tmdb_id` and `person.tmdb_id` are each unique (`001_init.sql:1699`, `:1902`). Credits exist twice: as `film_credit` rows (`001_init.sql:592-604`), replaced wholesale on each sync (`apps/api/src/services/tmdbSync.ts:104`), and as the raw `film.tmdb_credits` JSON snapshot (`001_init.sql:584`). Films can be soft-merged (`consolidated_into_film_id`, `database/migrations/014_film_consolidation_soft_merge.sql`), so selection matching must resolve consolidated films to their target.
- **TMDB client** (`apps/api/src/lib/tmdb.ts`): bearer-token reads (`:59`), plain `fetch` with no timeout or retry (`:79`), failures thrown as plain `Error` and therefore surfaced as 500s (`:89`). The only cache is the image configuration, kept for a day (`:97-119`). Searches send `include_adult=false` (`:181`, `:203`).
- **Routes.** All TMDB access is admin-only, behind `requireAdmin()` (`apps/api/src/server.ts:130`): film search (`apps/api/src/routes/admin/filmsReadTmdbSearch.ts:22`), people search (`peopleTmdbSearch.ts:20`), stored credits for a film (`filmsReadCredits.ts:15-21`) and import (`filmsImport.ts:19`). Film search fans out: one search plus up to eight detail calls to find directors (`filmsReadTmdbSearch.ts:28`, `:55-68`), so nine TMDB calls per keystroke-driven request.
- **Participant search.** None exists. The only non-admin search is the invitee lookup over users (`apps/api/src/routes/seasons/invitesInviteesSearch.ts:25`).
- **Rate limiting.** The limiter is an in-process sliding window (`apps/api/src/utils/rateLimiter.ts:6-9`). That is adequate on the single VPS instance, but limits reset on restart.

**What a public contender search needs.**

- Auth: signed-in users only, and only while they participate in a Circuit league.
- Limits: per-user and per-IP sliding windows on search and on credits. Validate the query: at least 2 characters, at most 100, trimmed.
- Cost: no per-result enrichment calls. Cache normalised search queries for about an hour and film credits for about a day, in process. Selecting a contender persists the film, and for acting selections the person and credits, through the existing `syncTmdbMovieById` path, so identity lives locally.
- Resilience: a 5-second timeout on TMDB calls; TMDB failures mapped to `AppError` 502/503 with no upstream body passed to clients.
- Acting selections: validate the person against the film's stored TMDB credits (any credit type qualifies, brief section 5).
- Attribution: show TMDB attribution where TMDB data appears; TMDB's API terms require it.

### 1.5 Scoring and result entry

- **Nomination entry.** Admin-only, `DRAFT` ceremonies only (`nominationsCreate.ts:44`). Acting nominations are stored as `nomination.film_id` plus one or more `nomination_contributor` people (`nominationsCreate.ts:129-145`, `:162` onward); the `performance` table is not used by this path. Exact Circuit matching is therefore: film-only categories on `nomination.film_id → film.tmdb_id`; acting categories on that plus `nomination_contributor.person_id → person.tmdb_id`; only `nomination.status = 'ACTIVE'` counts (`001_init.sql:753-756`).
- **Winner entry.** Admin-only, per category; replaces the winner set and supports ties (`winnerRepository.ts:14-32`). The first winner locks the ceremony and cancels in-progress drafts (`winnersUpsert.ts:93-107`). It is audit-logged (`:119`) and broadcast (`:133`). Finalize freezes results (`winnersFinalize.ts:46-67`); there is no correction after that (`winnersUpsert.ts:78`), which matches brief section 13.
- **Scoring.** Pure strategies over (picks, winners) only (`apps/api/src/domain/scoring.ts:53-125`), recomputed on every read of `GET /drafts/:id/standings` (`apps/api/src/routes/drafts/read.ts:105-171`). There are no nomination points, no ownership timing and no ledger. Category weights are keyed by `category_edition_id`, so they are per ceremony (`read.ts:135-160`).
- **For the Circuit.** Scoring at a scoring event is a function of (ownership at that date, nominations or winners, league scoring matrix). It needs ownership intervals, event dates and Circuit-category mappings, none of which exist. Results and nominations entry can be reused as is once the lifecycle change in 1.1 allows entry after publish. The winner-entry side effect (lock plus cancel drafts) touches only ceremony-specific drafts and should stay that way.

### 1.6 Findings outside this package

These were found during the audit and are deliberately not changed here:

1. `POST /drafts/:id/results` (`apps/api/src/routes/drafts/resultsRoute.ts:10`, handler `read.ts:69-98`) checks only that the caller is signed in (`apps/api/src/routes/drafts.ts:34`): any user can write `draft_result` rows for any draft. Nothing reads `draft_result`, so there is no scoring impact. Remove the route or require admin.
2. Season join paths that skip the membership lock (section 1.3): `publicJoin.ts:82`, `leagues/join.ts:75`.
3. Duplicate season-create endpoints (section 1.3).
4. Seat shuffle by `sort(() => Math.random() - 0.5)` (`start.ts:98`) is not a uniform shuffle.
5. Docs drift: `docs/architecture/scoring.md:7` describes the negative strategy as -1 per winner, but the code gives +points per winner and -points per non-winner (`apps/api/src/domain/scoring.ts:76-97`). `scoring.md:17` says one winner per category, but ties are supported. ADR 0001 says category editions are unique per (ceremony, family) (`docs/adr/0001-domain-model.md:33`); migration 009 changed that to (ceremony, code) (`database/migrations/009_denormalize_category_edition.sql`).

## 2. Domain model

[ADR 0005](../../adr/0005-series-domain-model.md) is the model the packages below build. In short:

- A separate `circuit_*` table family that never references Season or ceremony-draft tables.
- Selections keyed on `(category, film tmdb id[, person tmdb id])`.
- Ownership as append-only half-open intervals, with one open interval per (league, selection).
- A derived, rebuildable scoring ledger evaluated at 00:00 Pacific on each occasion's date.
- Waiver windows derived from ceremony dates.
- Its own draft tables, reusing the pure draft domain code and the sweeper pattern.

The only change to existing tables is `ceremony.nominations_on` and `ceremony.results_on` (package 02). The lifecycle migration from section 1.1 is package 01.

## 3. Work packages

Packages are in dependency order: no package depends on a later one. Each gets its own build brief, kept outside the repository. Sizes are judged against this repo's recent packages:

| Size | Meaning                                                  | Build shape                     |
| ---- | -------------------------------------------------------- | ------------------------------- |
| M    | one schema or service slice, little UI                   | one step, code review           |
| L    | schema, service, routes and one or two screens           | one or two steps, full review   |
| XL   | a full subsystem with real-time behaviour or a batch job | two or three steps, full review |

Every package also meets the repo's definition of done: `pnpm run ci` and GitHub CI pass, tests cover every changed behaviour, and the docs under `docs/` are updated. Packages that add or change screens update `docs/design/app-inventory.md` afterwards. UI packages get code review, functional QA (real flows, desktop and phone, keyboard only) and design review on the key screens only: new Circuit screens use existing components and tokens, so the full brand matrix is not re-baselined. Backend-only packages get code review.

| #   | Package                      | Brief step | Depends on | Size | Reviews                     |
| --- | ---------------------------- | ---------- | ---------- | ---- | --------------------------- |
| 01  | `series-01-lifecycle`        | 1, 7       | none       | M    | code, QA, inventory         |
| 02  | `series-02-foundation`       | 2, 7       | none       | L    | code, QA, inventory         |
| 03  | `series-03-contenders`       | 3          | 02         | L    | code, QA                    |
| 04  | `series-04-leagues`          | 2          | 02         | L    | code, QA, design, inventory |
| 05  | `series-05-ownership`        | 4, 5       | 03, 04     | L    | code, QA, inventory         |
| 06  | `series-06-draft-engine`     | 4          | 05         | XL   | code                        |
| 07  | `series-07-draft-room`       | 4          | 06         | XL   | code, QA, design, inventory |
| 08  | `series-08-waivers`          | 5          | 05, 06     | XL   | code, QA, inventory         |
| 09  | `series-09-scoring`          | 6          | 03, 05     | L    | code, QA, inventory         |
| 10  | `series-10-admin-completion` | 7          | 02, 09     | M    | code, QA, inventory         |
| 11  | `series-11-auction`          | 4          | 06, 07     | XL   | code, QA, design, inventory |
| 12  | `series-12-invariants`       | 8          | 08, 09     | M    | code                        |

Package 01 has no dependants: today's admin flow already lets Circuit ceremonies get nominations and winners (section 7). It is listed first because it closes the brief's lifecycle gap, but section 4 schedules it after the draft path.

### 01 Ceremony lifecycle reconciliation (`series-01-lifecycle`, M)

- **Scope:** the section 1.1 decision. Migration `021_ceremony_lifecycle_active.sql` (renumber if another migration lands first), `results_finalized_at`, the new `PUBLISHED → ACTIVE` "Open for leagues" action and wizard step, content edits allowed in `DRAFT` or `PUBLISHED`, and every API, web, docs, test and seed path listed in 1.1.
- **Acceptance:**
  - The migration backfills each existing status as 1.1 specifies (integration test on a seeded database with one ceremony per old status).
  - Seasons and drafts can be created only in `ACTIVE`.
  - Categories and nominations can be edited in `DRAFT` and `PUBLISHED` and are refused in `ACTIVE`, `LOCKED` and `ARCHIVED`.
  - Finalising sets `results_finalized_at` and keeps `LOCKED`; archive requires it.
  - `ceremony:finalized` carries `results_finalized_at`; the web final-results logic uses it.
  - No `COMPLETE` remains in code, docs or seeds (grep check in the PR).
- **Note:** it changes the live ceremony game. Merge it in a quiet period, before ceremony-specific Oscar leagues open on Oscar nominations day.

### 02 Circuit foundation (`series-02-foundation`, L)

- **Amended by 02b** (`series-02b-restructure`, [ADR 0006](../../adr/0006-circuit-admin-defined-structure.md)): the rename to Circuit, empty Circuits on creation, admin-defined events and template-based categories, and many-to-one mappings. The fixed slate in the scope and acceptance below describes migration 022 as first built.

- **Scope:** ADR sections 2 and 3:
  - `circuit`, `circuit_event`, `circuit_category`, `circuit_ceremony`, `circuit_mapping`, and the two ceremony date columns;
  - admin API and screens to create a Circuit (seeding its five events and eight categories), associate ceremonies from the Circuit side and from the ceremony side, edit mappings, and set dates on the ceremony admin;
  - the readiness check and activation;
  - audit-log entries for every write;
  - the public read endpoints the web needs (Circuit, events, categories, schedule).
- **Acceptance:**
  - Creating a Circuit yields exactly five events and eight categories, with `kind` fixed by code.
  - One association is visible and editable from both admin screens.
  - A category edition maps to at most one Circuit category (database constraint test).
  - Activation succeeds with missing dates and returns the ceremonies that lack them (unit test on the pure readiness function; integration test on the route).
  - Editing a date after activation leaves `status = 'ACTIVE'`.
  - Every write appears in `admin_audit_log`.
  - The schema test asserts no foreign key between `circuit_*` and Season or ceremony-draft tables, and an ESLint `no-restricted-imports` rule blocks imports in either direction (ADR section 10).

### 03 Contender search and selections (`series-03-contenders`, L)

- **Scope:** ADR section 5 and audit 1.4:
  - signed-in public film search and film-credit lookup through TMDB, with per-user and per-IP rate limits, query validation (2–100 characters), an in-process cache (search about 1 hour, credits about 1 day), a 5-second timeout, and TMDB failures mapped to `AppError` 502/503 with no enrichment fan-out;
  - `circuit_selection` with the TMDB-identity unique key, upserted through `syncTmdbMovieById`;
  - acting validation against stored credits;
  - the pure matching function against nominations and winners, following film consolidation;
  - a reusable web picker (category, then film, then person for acting categories) with TMDB attribution.
- **Acceptance:**
  - A film-only and an acting selection for the same film coexist, and so do two people from one film in one acting category, and one person-film pair in two acting categories.
  - Upserting an existing identity returns the same row.
  - A person outside the film's credits is refused, while any credit type is accepted.
  - A selection row cannot be updated (no route; repository test).
  - Matching unit tests cover: mapped versus unmapped editions, Globes Drama and Comedy both mapping to Best Picture without double scoring, consolidated films, inactive nominations, and acting matches that need both ids.
  - Search is rate-limited (429 after the limit), cached (one upstream call for repeated queries), and returns 502/503 on TMDB failure without upstream text (integration tests with a stubbed TMDB).

### 04 Circuit leagues and membership (`series-04-leagues`, L)

- **Scope:** ADR section 4:
  - `circuit_league`, `circuit_league_event`, `circuit_league_category`, `circuit_league_member`;
  - creating a Circuit competition in an existing league, and joining through the league;
  - setup screens for enabled events, roster size, category limits, scoring values and weights, and draft settings (snake, 90-second default, auto-draft on or off);
  - initialisation, and the single `assertCircuitLeagueOpen` guard;
  - Circuit competitions listed beside Seasons on the league and home navigation, reached the same way.
- **Acceptance:**
  - Defaults are every event of the Circuit enabled, roster 16, unlimited category limits, 1 + 2 points, weights 1 and a 90-second clock.
  - An event of several ceremonies (the default Guild event) toggles as one unit.
  - Any subset of events, including none, can be saved.
  - After initialisation, every member and event write path is refused (one integration test per route, all failing through the guard).
  - Only league members can join.
  - A league can hold a Season and a Circuit at once, and changing one never changes the other's members (integration test).

### 05 Ownership, transactions and free agency (`series-05-ownership`, L)

- **Scope:** ADR section 7:
  - `circuit_ownership` intervals and `circuit_transaction`;
  - the ownership service every acquisition path uses (member-row lock, capacity and category-limit checks, add with an atomic drop);
  - immediate drops;
  - free-agent add, with a drop when at capacity, allowed only outside waiver windows;
  - the pure `waiverWindows()` function from ADR section 9, used here to close free agency;
  - roster and league transaction-log screens, with the picker from 03.
- **Acceptance:**
  - Concurrent acquisitions of one selection: exactly one succeeds (integration test with parallel transactions).
  - An add at capacity without a drop fails; with a drop it succeeds as one transaction and the roster never exceeds capacity.
  - Category limits are enforced.
  - A dropped selection can be re-acquired at once, including by its former owner.
  - Intervals are append-only, and "owner at `t`" is correct around boundaries (unit tests on the pure interval functions).
  - `waiverWindows()` unit tests reproduce the 2026–27 windows in section 4.
  - Free agency is refused inside a window and allowed outside.

### 06 Circuit draft engine (`series-06-draft-engine`, XL, three steps)

- **Scope:** ADR section 6, backend:
  - `circuit_draft*` tables and `circuit_queue_item`;
  - start (uniform seat shuffle, rounds equal to roster size) and manual picks (idempotent, rate-limited, turn-checked);
  - each pick writes ownership through the 05 service;
  - the queue API (add, remove, reorder, at any time);
  - queue-only auto-draft;
  - timer and sweeper integration (one sweeper loop, a second query);
  - missed picks, the supplemental round and chip creation;
  - the `/circuits` namespace with versioned events, and the snapshot route.
- **Steps:** (1) schema, start, manual picks, ownership writes; (2) queue, auto-draft, timer, missed picks, supplemental round, chips; (3) namespace, events, snapshot and reconnect.
- **Acceptance:**
  - Snake order matches `getSnakeSeatForPick`.
  - A selection can be drafted once per draft (constraint test), and a drafted selection never becomes available again during the draft.
  - Auto-draft takes the first queued selection that is unowned and fits; it skips owned rows without deleting them, and records `MISSED` when nothing fits. It never picks outside the queue (unit and integration tests, including an empty queue).
  - The queue edited mid-draft changes the next auto-pick.
  - Each missed pick gets one supplemental pick in original order; a missed supplemental creates exactly one chip with the original pick number.
  - The default clock is 90 seconds, and 0 means untimed.
  - Snapshot plus events reproduce the board after a reconnect.
  - Only Circuit league members can join the namespace room.

### 07 Circuit draft room (`series-07-draft-room`, XL, two steps)

- **Scope:** the web draft room for Circuit drafts:
  - the board by participant and by category;
  - the 03 picker for live picks;
  - the crib sheet and queue, editable before and during the draft;
  - clock, turn and auto-draft state, missed and supplemental picks;
  - reconnect and resync, reusing the draft-room primitives and the `useDraftSocket` pattern;
  - a pre-draft lobby.
- **Steps:** (1) lobby, queue editor, board read-only from snapshot; (2) live picking, clock, reconnect, supplemental round.
- **Acceptance:**
  - A full draft of four participants runs end to end in e2e, including a timed-out participant drafted from their queue and one with an empty queue whose pick goes to the supplemental round.
  - Reorder works by keyboard.
  - It works on phone and desktop in light and dark modes of the default brand.
  - Reconnecting mid-draft restores the board without a reload.

### 08 Waivers, priority and chips (`series-08-waivers`, XL, three steps)

- **Scope:** ADR section 9:
  - `circuit_waiver_run`, `circuit_waiver_claim`, `circuit_chip` status;
  - rolling priority initialised in reverse draft order when the draft completes;
  - claims (ranked, one per selection per window, optional conditional drop, optional chip; private, editable until resolution);
  - the processor (one transaction per league and window, sequential, idempotent) and its scheduler (advisory-locked loop, catch-up after downtime);
  - chip consumption and first-window expiry;
  - results visible after the run, real-time result events;
  - claims and priority screens, including the warning that a claim without a drop may fail at capacity.
- **Steps:** (1) claims and chips data plus API; (2) processor and scheduler; (3) screens and events.
- **Acceptance (integration tests unless noted):**
  - Chipped claims run before unchipped, by original pick number; unchipped claims follow rolling priority.
  - Each won claim changes the state seen by the next.
  - Two claims naming the same drop: the second fails.
  - A claim without a drop fails at capacity and succeeds with space.
  - A failed claim keeps its chip and leaves the roster unchanged.
  - Multiple wins by one member move them to the bottom once.
  - Priority is unchanged by failures.
  - All chips expire when the first window resolves.
  - Another member's pending claims are never returned by any route.
  - Edits after the processor's lock are refused.
  - Re-running a completed window is a no-op.
  - A window whose resolution instant passed during downtime is processed on the next tick.
  - Drops during a window are immediate; free-agent adds during it are refused.

### 09 Scoring ledger and standings (`series-09-scoring`, L)

- **Scope:** ADR section 8:
  - `circuit_score_entry`, and the pure `scoreOccasion` function;
  - ledger rebuilds triggered by nomination, winner, date, mapping and enabled-event writes, plus an admin "rebuild" action;
  - cumulative standings with per-ceremony breakdown screens;
  - real-time score-update events.
- **Acceptance (unit tests on the pure function, integration tests on rebuild triggers):**
  - Ownership at the 00:00 Pacific instant decides each occasion.
  - A selection dropped between nomination and win: the nomination owner keeps 1 and the win owner gets 2.
  - A nominated winner owned throughout scores 3.
  - Nominations and wins on one day score together.
  - No points before a league's first ownership.
  - Disabled events never score.
  - Weights multiply.
  - A selection scores once per occasion even with two mapped editions.
  - A rebuild is idempotent.
  - Standings equal the ledger's sum.

### 10 Administration completion (`series-10-admin-completion`, M)

- **Scope:**
  - readiness and schedule views for admins;
  - mapping coverage reports (which Circuit categories each ceremony supplies);
  - audit coverage of every Circuit admin write;
  - real-time Circuit status and schedule-change events;
  - a public Circuit rules page stating the ownership instant, the window rule and the scoring defaults.
- **Acceptance:**
  - Every Circuit admin route writes an audit row (one table-driven test).
  - A date change emits a schedule event and shifts the derived windows.
  - The rules page renders the league's actual settings.

### 11 Auction draft (`series-11-auction`, XL)

- **Scope:** auction as a `draft_type`, once the owner answers the auction questions (behaviour is deferred in brief section 15): lots, bids, budgets, nomination order and the clock. It uses the same ownership writes, queue and missed-pick rules where they apply.
- **Acceptance:** to be written from the owner's answers. At minimum: bids are server-authoritative and serialised, budgets never go negative, and every won lot writes one ownership interval.
- **Note:** off the critical path. Snake is the default, and leagues can choose auction only once this ships.

### 12 Critical invariants suite (`series-12-invariants`, M)

- **Scope:** the cross-cutting tests in section 8 that no single package owns, plus one simulated season. A fake clock runs draft, nominations, a waiver window, a mid-season drop and re-acquisition, wins and final standings across two leagues with different enabled events.
- **Acceptance:** every row of the section 8 table names a passing test.

## 4. Schedule against the real dates

### Verified dates, 2026–27

Checked on 2026-11-16 against [AwardsWatch](https://awardswatch.com/2026-2027-film-awards-calendar/), the [Rotten Tomatoes awards calendar](https://editorial.rottentomatoes.com/article/2026-2027-awards-calendar/), [TheWrap](https://www.thewrap.com/industry-news/awards/critics-choice-awards-set-2027-date/), the [Actor Awards calendar](https://actorawards.org/awards/calendar) and the [WGA press release](https://www.wgaeast.org/2027-writers-guild-awards-date-announced/).

| Ceremony          | Nominations    | Ceremony       | Notes                                                                                          |
| ----------------- | -------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| Critics Choice    | Fri 2026-12-04 | Sun 2027-01-03 | TheWrap, AwardsWatch, Rotten Tomatoes                                                          |
| Golden Globes     | Mon 2026-12-07 | Sun 2027-01-10 | AwardsWatch, Rotten Tomatoes                                                                   |
| Actor Awards      | Wed 2027-01-06 | Sun 2027-02-28 | actorawards.org calendar; Rotten Tomatoes still lists nominations as TBD                       |
| DGA               | Thu 2027-01-07 | Sat 2027-01-30 | AwardsWatch, Rotten Tomatoes                                                                   |
| PGA               | Fri 2027-01-08 | Sat 2027-02-27 | theatrical feature nominations (documentary nominations are 2026-12-08 and not in the Circuit) |
| WGA               | Fri 2027-01-08 | Sat 2027-02-13 | WGA press release and media timeline; Rotten Tomatoes lists both as TBD                        |
| BAFTA Film Awards | Tue 2027-01-19 | Sun 2027-02-21 | longlists 2027-01-07 do not score                                                              |
| Academy Awards    | Thu 2027-01-21 | Sun 2027-03-14 | Oscar shortlists 2026-12-15 do not score                                                       |

That is 16 scoring occasions (8 ceremonies × nomination and win) on 15 distinct days, because PGA and WGA nominations fall on the same day. Brief section 3 says fourteen; [owner question 8](#9-owner-questions) asks about the difference. Recheck the TBD-elsewhere dates (Actor Awards nominations, WGA) when package 02 lands, and enter any change in the ceremony admin: windows and scoring follow the dates.

### Derived waiver windows (all events enabled)

The ADR section 9 rule applied to these dates. Resolution happens at 00:00 Pacific on the day after the last covered day.

| #   | Trigger                                    | Covers                  | Resolves (00:00 PT) |
| --- | ------------------------------------------ | ----------------------- | ------------------- |
| 1   | Critics Choice nominations                 | Dec 4–6                 | Mon Dec 7           |
| 2   | Golden Globes nominations                  | Dec 7–9                 | Thu Dec 10          |
| 3   | Critics Choice ceremony                    | Jan 3–5                 | Wed Jan 6           |
| 4   | Actor Awards, DGA, PGA and WGA nominations | Jan 6–9 (block Jan 6–8) | Sun Jan 10          |
| 5   | Golden Globes ceremony                     | Jan 10–12               | Wed Jan 13          |
| 6   | BAFTA and Oscar nominations                | Jan 19–23 (merged)      | Sun Jan 24          |
| 7   | DGA ceremony                               | Jan 30–Feb 1            | Tue Feb 2           |
| 8   | WGA ceremony                               | Feb 13–15               | Tue Feb 16          |
| 9   | BAFTA ceremony                             | Feb 21–23               | Wed Feb 24          |
| 10  | PGA and Actor Awards ceremonies            | Feb 27–Mar 1            | Tue Mar 2           |
| —   | Academy Awards                             | none (final occasion)   | —                   |

Windows 1–2 and 3–5 abut: window 2 opens the moment window 1 resolves, so there is no free agency between them. Window 6 is the only overlap (BAFTA nominations on the 19th, Oscar nominations on the 21st) and uses the recommended merge rule ([owner question 10](#9-owner-questions)). For a league that drafts before Dec 4, chips expire when window 1 resolves on Dec 7.

### Milestones, working back from each scoring occasion

The plan PR merges and the owner answers the questions by **Tue 2026-11-17**. Builds start that evening. Packages are built one at a time and can stack on unmerged PRs, so a merge does not block the next build, but each package must be merged _and deployed_ by its date.

| Milestone                                         | What must be live                                                                                                | Latest date                        |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| A. Ops can set up the 2026–27 Circuit             | 02                                                                                                               | Thu Nov 19                         |
| B. Leagues can form and configure                 | 03, 04                                                                                                           | Tue Nov 24                         |
| C. Leagues can draft (go or no-go)                | 05, 06, 07; all eight ceremonies, mappings and 16 dates entered; Circuit activated                               | Sun Nov 29                         |
| D. Before the first nominations and waiver window | 08 (claims open at Fri Dec 4 00:00 PT; the first run is at Mon Dec 7 00:00 PT); drafts finished by Thu Dec 3     | Thu Dec 3                          |
| E. Points visible                                 | 09 (the ledger rebuilds Dec 4 and Dec 7 retroactively from ownership history; nothing is lost if it lands later) | target Wed Dec 9; latest Sat Jan 2 |
| F. Before the first ceremony (Jan 3)              | 09 merged; winner entry rehearsed on a Circuit ceremony; 12 merged                                               | Sat Jan 2                          |
| G. Before the guild nomination crunch (Jan 6–8)   | 10                                                                                                               | Tue Jan 5                          |
| H. Before Oscar nominations (Jan 21)              | 01 merged and deployed in the quiet week before ceremony-specific Oscar leagues open                             | Thu Jan 14                         |

**Latest merge date per package (target A, drafts Nov 30–Dec 3):**

| Package             | Build window        | Latest merge and deploy                    | Why that date                                       |
| ------------------- | ------------------- | ------------------------------------------ | --------------------------------------------------- |
| 02 foundation       | Nov 17–18           | Thu Nov 19                                 | ops setup needs it; everything else builds on it    |
| 03 contenders       | Nov 19–20           | Sat Nov 21                                 | 05 and the picker need selections                   |
| 04 leagues          | Nov 21–22           | Tue Nov 24                                 | leagues must form before they can schedule a draft  |
| 05 ownership        | Nov 23              | Wed Nov 25                                 | the draft writes ownership through it               |
| 06 draft engine     | Nov 24–26           | Fri Nov 27                                 | 07 needs the API and events                         |
| 07 draft room       | Nov 27–28           | Sun Nov 29                                 | go or no-go: players need a few days' notice        |
| 08 waivers          | Nov 29–Dec 2        | Thu Dec 3                                  | claims open Dec 4                                   |
| 09 scoring          | Dec 3–5             | Sat Jan 2 (target Dec 9)                   | derived; must be there for the first ceremony       |
| 12 invariants       | Dec 6–7             | Sat Jan 2                                  | before the first ceremony scores wins               |
| 10 admin completion | Dec 8               | Tue Jan 5                                  | before the busiest nomination week                  |
| 01 lifecycle        | Dec 9–10            | Thu Jan 14                                 | quiet period before ceremony-specific Oscar leagues |
| 11 auction          | after owner answers | none this season unless answered by Nov 29 | snake is enough to play                             |

**Fallback target B (no-go on Nov 29):** drafts run Mon Dec 14 to Tue Jan 5, after the Golden Globes nominations window has resolved (Dec 10 at 00:00 PT). Leagues miss the Critics Choice and Golden Globes nominations (2 of 16 occasions), and also the Critics Choice ceremony if they draft after Jan 2. Latest merges: 07 by Sun Dec 13 (drafts from Dec 14), and 08 and 09 by Sat Jan 2, before window 3 opens on Jan 3. The rest is unchanged. Moving later than Jan 5 means drafting after the guild nominations, which removes 7 of 16 occasions. At that point the owner should consider waiting for next season instead.

## 5. Feasibility

**Plain statement.** Shipping the _full_ brief, auction included, before the first nominations on Dec 4 is not feasible. Shipping everything the brief requires _except_ auction, with leagues drafting before Dec 4, is possible but has no slack: it needs seven packages (02–08), three of them XL, merged and deployed in 16 days with no failed build, no fix round beyond the first, and same-day owner review over Thanksgiving week. The more likely outcome is target B: leagues draft between Dec 14 and Jan 5, and the full brief minus auction is complete by Jan 5. Under target B, leagues lose at most three of sixteen occasions, all of them early and low in value next to the guild, BAFTA and Oscar occasions. Auction is feasible this season only if the owner answers its questions early and capacity remains after 10; otherwise it should wait for next season.

**Critical path:** 02 → 03 → 04 → 05 → 06 → 07 (leagues can draft) → 08 (first waiver window). Package 09 is on the path only for the first ceremony (Jan 3). Packages 01, 10, 11 and 12 are off the path.

**Assumptions:**

- **Build throughput, from this repo's recent package history:** comparable full-review packages took 1.5–2 hours of build time from start to a green PR (`site-content`, `home-signatures`); small packages took minutes (`create-favicon`, 10 minutes); several earlier packages were interrupted and resumed, adding a run each. Circuit packages are backend-heavy and integration-tested, so this plan assumes an L takes half a build day and an XL a full build day, including one fix round and one interruption. The total, 01–10 plus 12, is about 7 build days, spread over more calendar days by reviews, fix rounds and deploys. Build capacity is rationed per week, and the Circuit is likely to use most of a week's worth; hitting that limit in late November would slip the path by days.
- **Owner review:** PRs #410–#419 merged a median of about 20 minutes after opening (range 4 minutes to 6 hours). At the time of writing, four PRs (#422–#425) had waited overnight. The schedule assumes each package merges and deploys within a day of its PR.
- **Capacity:** the parked Cinema theme work stays parked, and nothing else is queued ahead of the Circuit path until 08 merges ([owner question 13](#9-owner-questions)).
- **No scope growth:** the brief's deferred items stay deferred. Each owner answer that adds behaviour adds to a package's size.

## 6. Fallback order

The rule: anything that is a _pure function of recorded truth_ can land late. Anything that _records_ truth, or that players act on at a fixed time, cannot.

**Can ship after the season starts without losing data or fairness:**

1. **09 scoring ledger and standings.** The ledger is derived from ownership intervals, dates and nominations, and rebuilding it later produces the same points. Cost of lateness: players cannot see standings yet.
2. **10 administration completion.** Rules page, coverage reports and audit coverage beyond the basics. Package 02 already audit-logs every write.
3. **01 lifecycle.** Today's flow works for Circuit ceremonies (section 7). It must avoid the live ceremony-game windows, so after Mar 14 is also acceptable.
4. **12 invariants suite.** It adds risk if late, but no data loss. Each package already carries its own invariant tests.
5. **11 auction.** It only affects leagues that have not drafted. Snake is always available.
6. **Real-time for scoring and schedule events.** A refresh shows the same data.

**Cannot ship late (relative to each league's draft and first window):**

1. **02, 03, 04:** without them there is no league.
2. **05 ownership intervals and 06 draft engine:** ownership must be recorded from the first pick. A draft that writes only picks would lose acquisition times, and with them scoring truth.
3. **07 draft room:** the draft is live.
4. **08 waivers, by the league's first window.** If it is late, acquisitions are blocked during that window: fair to everyone, but chips lose their only chance before they expire. [Owner question 12](#9-owner-questions) asks whether chips should then expire with the first window the league can actually claim in.
5. **Ops: ceremony dates.** Windows derive from them. A missing date leaves free agency open on an announcement day. Scoring stays fair (the 00:00 instant still decides), but the acquisition rule is broken for that day.

## 7. Operational work outside code

The owner is the only global admin (`requireAdmin`), so the owner does all of this unless a second admin is appointed.

**Setup, Nov 19–29 (after 02 merges, before go or no-go):**

- **Create seven ceremonies** in `DRAFT`: Critics Choice, Golden Globes, Actor Awards, DGA, PGA, WGA and BAFTA. The Oscars ceremony already exists for the ceremony game.
- **Create only the mapped categories** in each, about 47 editions in total:

  | Ceremony       | Categories                                                                                         | Editions |
  | -------------- | -------------------------------------------------------------------------------------------------- | -------- |
  | Critics Choice | picture, director, four acting, original and adapted screenplay, animated                          | 9        |
  | Golden Globes  | drama and musical/comedy picture, animated, director, six acting (lead split by genre), screenplay | 11       |
  | Actor Awards   | four individual film acting                                                                        | 4        |
  | DGA            | feature film                                                                                       | 1        |
  | PGA            | theatrical motion picture, animated                                                                | 2        |
  | WGA            | original, adapted                                                                                  | 2        |
  | BAFTA          | film, director, four acting, two screenplay, animated                                              | 9        |
  | Oscars         | the same nine as BAFTA                                                                             | 9        |

- **Create the 2026–27 Circuit.** Add the eight ceremonies, group the four guilds into one Guild event, build the eight categories from templates, map the 47 editions and enter the 16 dates from section 4.
- **Activate the Circuit** and check the readiness report shows nothing missing.
- **Announce** the opening and the rules page to players.

**On each nomination day:**

- Import any new films and people from TMDB. Admin film search costs nine TMDB calls per search (audit 1.4), so search sparingly.
- Enter nominations. The bulk upload `nomineesUploadCeremony.ts` works while the ceremony is `DRAFT`.
- Publish the ceremony once it is complete, so winners can be entered later (winner entry requires a published ceremony, `winnersUpsert.ts:64`).

Before package 01 lands, nominations cannot be corrected after publish except by revoke or replace (`nominationsChange.ts:25`), so publish only after checking the list. Rough nominee counts from recent years:

| Ceremony       | Nominees |
| -------------- | -------- |
| Critics Choice | about 58 |
| Golden Globes  | about 66 |
| Actor Awards   | 20       |
| DGA            | 5        |
| PGA            | about 15 |
| WGA            | about 10 |
| BAFTA          | about 50 |

That is about 225 rows outside the Oscars. The heaviest stretch is Jan 6–10: four nomination days and one ceremony in five days.

**On each ceremony day:**

- Enter winners per mapped category. The first winner locks the ceremony and cancels ceremony-specific drafts, which do not exist for these seven ceremonies.
- Finalise when complete.
- Ledger rebuilds are automatic after 09; before it, nothing is needed.

**Ongoing:**

- Watch the waiver scheduler's runs at each resolution instant in section 4. The first one is Mon Dec 7 00:00 PT.
- Correct dates if a ceremony moves.

## 8. Critical invariants test plan

Brief section 16, step 8, and every invariant in brief section 17. Each row names the package that owns it and the test that proves it. Package 12 adds the cross-package rows and the simulated season.

| Invariant (brief section 17 unless noted)                                                            | Enforced by                                          | Test (package)                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Circuit and Season are separate                                                                      | no cross foreign keys; import rule                   | schema test on `information_schema`; ESLint rule (02); league with both, independent membership (04); winner entry never touches `circuit_draft` (12) |
| Admin-defined events and categories (default slate: eight categories, five events)                   | empty on create; added by admins                     | create test (02b)                                                                                                                                     |
| Grouped ceremonies are indivisible for leagues (default: Guild event of Actor Awards, DGA, PGA, WGA) | one `circuit_event` row; four associations           | event toggle test (04); association test (02)                                                                                                         |
| Film-only categories select films; acting categories select a person in a film                       | `circuit_selection` kind check                       | selection constraint tests (03)                                                                                                                       |
| Person must be in the film's TMDB credits; any credit type                                           | credit validation on upsert                          | integration test with crew and cast credits (03)                                                                                                      |
| Any TMDB film is selectable                                                                          | no eligibility check                                 | selection of an old and an unreleased film (03)                                                                                                       |
| Selections immutable and exclusive while owned                                                       | no update path; partial unique index                 | repository test (03); concurrent acquisition test (05)                                                                                                |
| One film in many categories; many people from one film in one acting category                        | identity key includes category and person            | multiplicity tests (03); drafting all of them in one draft (06)                                                                                       |
| Only official nominations and wins score                                                             | matching reads only active nominations and winners   | matching unit tests (03); scoring tests (09)                                                                                                          |
| Exact matching by TMDB identity and Circuit category (16.8 category mapping)                         | pure matcher; mapping table                          | matcher unit tests including unmapped editions and two editions mapped to one category (03)                                                           |
| Ownership at each scoring event decides points (16.8 ownership changes between events)               | intervals; 00:00 PT instant                          | drop between nomination and win (09); simulated season (12)                                                                                           |
| Default 1 + 2 points                                                                                 | column defaults                                      | defaults test (04); nominated winner scores 3 (09)                                                                                                    |
| One cumulative leaderboard                                                                           | standings sum the ledger                             | standings equal ledger sum (09)                                                                                                                       |
| Roster 16 by default; category limits optional, unlimited by default                                 | defaults; capacity check under lock                  | defaults (04); capacity and limit tests (05)                                                                                                          |
| No expiration; owned selections hold roster space until dropped                                      | no expiry state; intervals close only by transaction | ownership persists past its last occasion (12)                                                                                                        |
| Draft live and synchronous; 90-second default clock                                                  | `circuit_draft` timer; sweeper                       | timer and default tests (06); e2e draft (07)                                                                                                          |
| One ranked list is the crib sheet and the auto-draft queue                                           | `circuit_queue_item` read live                       | mid-draft edit changes next auto-pick (06)                                                                                                            |
| Auto-draft uses only that list and never invents a pick                                              | queue-only auto-pick                                 | empty and fully owned queue gives `MISSED` (06)                                                                                                       |
| Missed picks get one supplemental chance, then a unique-value chip                                   | supplemental round; unique `original_pick_number`    | supplemental and chip tests (06)                                                                                                                      |
| Waivers resolve in batches around event blocks; free agency is immediate between windows             | derived windows; scheduler; free-agency guard        | `waiverWindows()` against section 4 (05); free agency refused in a window (05); scheduler catch-up (08)                                               |
| Rolling priority starts in reverse draft order; winners drop to the bottom once per run              | priority rewrite at run end                          | priority tests (08)                                                                                                                                   |
| Chips outrank rolling priority and expire when the first window closes (16.8 consumption)            | claim ordering; expiry in the first run              | ordering, consumption on success only, expiry (08)                                                                                                    |
| Claims private until resolution, editable until the window closes                                    | owner-only reads; lock at processing                 | privacy and edit-lock tests (08)                                                                                                                      |
| Claims may omit a drop but fail at capacity (16.8 sequential claims, conditional add and drop)       | evaluation against live state                        | same-drop, no-drop and sequential tests (08)                                                                                                          |
| Membership and event selection lock at initialisation (16.8 fixed membership)                        | `assertCircuitLeagueOpen`                            | every write path refused after initialisation (04)                                                                                                    |
| Past scoring events never award points (16.8 no retroactive scoring)                                 | no ownership before the draft; 00:00 instant         | league drafted after an occasion, and a draft on an event day (09); late-starting league in the simulation (12)                                       |

## 9. Owner questions

The plan needs these answers and the brief does not give them. Each one has a recommended answer. Section 4 assumes answers by **Tue 2026-11-17**. If a question is still open when the package that needs it starts, the package builds the recommended answer, and a later change becomes new scope. Questions 1–7 are items brief section 15 defers. Questions 8–12 are conventions this plan had to assume. Questions 13–16 are about process, and 17–19 come from the audit.

1. **Supplemental-pick mechanics** (brief section 15, "Draft and acquisition details"; needed by 06, build starts Nov 24). How does the one-time chance after a missed pick work? _Recommended:_ after the last regular pick, run one extra round made up only of the missed picks, in original pick order, on the same clock. Auto-draft from the queue applies. A supplemental pick that is missed again becomes one chip valued at the original pick number. There is no second supplemental chance.
2. **Auction draft** (brief section 15; package 11). This needs the budget per participant, nomination order, minimum bid and increment, bid clock, and what happens to a roster left unfilled when the budget runs out. _Recommended:_ defer auction to next season unless these are answered by Sun Nov 29. Snake is then the only draft type this season, and league setup does not offer the choice.
3. **Draft structure options** (brief section 15). _Recommended:_ snake only this season, plus auction if question 2 is answered in time. No linear option, although the ceremony draft schema still allows `LINEAR` (audit 1.2).
4. **Acquisition settings beyond the decided model** (brief section 15). _Recommended:_ none this season. That means no waiver budgets, no per-window claim limits and no configurable window length. Brief section 6's "other supported scoring weights and values" are likewise only the four in ADR section 4: nomination points, win points, category weights and event weights.
5. **Schedule changes during an open window** (brief section 15, "Calendar and scheduling"; needed by 08, Nov 29). _Recommended:_ windows always derive from the current dates, with one exception. Once a window has opened, its start date is fixed, because claims are keyed to it, and a date edit can only push its end later. A change that would shorten or cancel an open window takes effect from the next window. Points always follow the corrected date, through a ledger rebuild.
6. **Structural edits after activation** (brief section 15; needed by 02, Nov 17, and 10). These are adding or removing a ceremony, or changing a mapping, after leagues have initialised. _Recommended:_ allow them, for admins only. Each one needs a confirmation step that states how many initialised leagues it affects, writes an audit row and triggers a ledger rebuild. No further restrictions this season.
7. **Selection reconciliation** (brief section 15). _Recommended:_ stays deferred this season. Matching is exact on TMDB ids, so a contender with two TMDB records scores only under the record a ceremony's nomination uses. Nomination entry uses the record with the film's main credits, and duplicates are reported to TMDB rather than merged here.

8. **Fourteen or sixteen scoring occasions.** Brief section 3 says fourteen. Eight ceremonies, each with nominations and a win, make sixteen (section 4). _Recommended:_ sixteen, since nothing in the brief exempts a ceremony from either occasion. If fourteen was meant, name the two occasions that do not score.
9. **The ownership instant** (needed by 05 and 09, Nov 23). _Recommended:_ confirm 00:00 America/Los_Angeles on the occasion's date (ADR section 3). The date to enter is the Pacific date on which the announcement starts. An announcement that starts before 00:00 Pacific on its local date (possible for BAFTA, which announces from London) is entered under the earlier Pacific date. Ops checks the BAFTA announcement time when it is published.
10. **Overlapping waiver windows** (needed by 05, Nov 23). BAFTA nominations on Jan 19 open a window covering Jan 19–21, and Oscar nominations land on Jan 21. _Recommended:_ a scoring day inside an open window extends that window to two days after that day (ADR section 9), so window 6 covers Jan 19–23 and resolves on Jan 24. The alternative is a separate Oscar window from Jan 21 to 23, alongside the BAFTA one. That would leave two windows open at once, with claims split between them.
11. **Weights and settings after initialisation** (needed by 04, Nov 21). _Recommended:_
    - Weights multiply: points = base × category weight × event weight. They are positive and default to 1.
    - Roster size, category limits, points and weights freeze at initialisation, together with membership and enabled events.
    - The pick clock and the auto-draft switch stay editable until the draft starts.

12. **Chip expiry for a league that cannot claim in window 1** (needed by 08, Nov 28). The brief says chips expire when the first waiver window closes. A league that drafts after Dec 4, or that has no claims system because 08 shipped late, never had a chance to use its chips in window 1. _Recommended:_ a league's first window is the first one that opens after its draft completes and while claims are live. Its chips expire when that window resolves.

13. **Capacity.** Does Cinema chunk 22 stay parked, with nothing queued ahead of the Circuit path, until 08 merges? _Recommended:_ yes.
14. **Owner review over Nov 19–Dec 3, including Thanksgiving (Nov 26).** Target A needs each PR merged and deployed within a day of opening. _Recommended:_ commit to one review slot a day. If that is not possible, choose target B now and tell players drafts open Dec 14.
15. **A second admin for nomination days**, especially Jan 6–10: four nomination days and one ceremony in five days (section 7). _Recommended:_ appoint one trusted person as a global admin by Dec 1. Otherwise the owner does all the operational work.
16. **Go or no-go on Sun Nov 29.** _Recommended:_ the owner decides that evening. Go only if 05–07 are merged and deployed and a rehearsal draft with test accounts has completed on production. Otherwise switch to target B and tell players the same day.

17. **Duplicate season-create route** (audit 1.3). _Recommended:_ retire `POST /seasons/leagues/:id/seasons` in a small cleanup after Mar 14, not during the ceremony season.
18. **A 90-second default for ceremony-specific Seasons** (audit 1.2). The Circuit gets one. _Recommended:_ no change to the live ceremony game this season; revisit after Mar 14.
19. **Audit findings 1, 2 and 4** (section 1.6). _Recommended:_ fix them in one small package queued after 08, merged with 01 in the quiet week before Jan 14. That package would stop any signed-in user from writing `draft_result` rows, add the membership lock to both Season join paths and use a uniform seat shuffle. The join fix matters before ceremony-specific Oscar leagues open on Jan 21. There is no build brief for it yet; ask for one.
