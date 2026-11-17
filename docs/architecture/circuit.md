# Circuit

A Circuit is a season-long competition across several awards ceremonies; players see it as a Season. The domain model and its reasoning are in [ADR 0005](../adr/0005-series-domain-model.md), as amended by [ADR 0006](../adr/0006-circuit-admin-defined-structure.md) and [ADR 0007](../adr/0007-circuit-groups-and-derived-dates.md); the build order is in the [plan](../planning/series/plan.md). This page describes what exists today: the foundation (migration `022_series_foundation.sql`, renamed and made admin-defined by `023_circuit_admin_structure.sql`, with groups and the derived results date from `025_circuit_groups_and_derived_results_date.sql`), contender selections (`026`), league competitions (`027_circuit_league.sql`), ownership with transactions (`028_circuit_ownership.sql`) and the draft (`029_circuit_draft.sql`, with the queue and chips in `030_circuit_queue_and_chip.sql`). Scoring, waiver claims and chip use come in later packages.

## TL;DR

- **Vocabulary.** Code, tables and admin screens say **Circuit**. Player-facing copy always says **Season**, for both competitions: a person joins a season, whether it covers one ceremony or the whole run. Admin events stay **Event**; a Circuit category is shown to players as **Category**. See [ADR 0006, section 1](../adr/0006-circuit-admin-defined-structure.md#1-vocabulary).
- A new Circuit is **empty**. Admins add any ceremonies, gather some into named **groups**, and build **Circuit categories** from category templates.
- Every associated ceremony belongs to exactly one event: a group, or its own one-ceremony event. Leagues enable and weight whole events.
- Admins **map** each ceremony category to at most one Circuit category; several ceremony categories may map to the same one (many-to-one). A matching template pre-selects the mapping on screen, but only an explicit save creates it. Nothing is inferred from names.
- Each ceremony has a **nominations date** (`ceremony.nominations_on`) and a **results date**, which is the date of its ceremony datetime (`ceremony.starts_at`) in America/Los_Angeles. Every associated ceremony gives two **scoring occasions**, one per date.
- **Activation** (`DRAFT → ACTIVE`) never waits for dates. It returns the associated ceremonies that still lack one.
- A league runs a **Circuit league** beside its Seasons, with its own members, enabled events, roster and scoring. Membership and events freeze at **initialisation**, through one guard (`assertCircuitLeagueOpen`).
- **Ownership** is append-only history: half-open intervals per (league, selection), each boundary pointing at one transaction. One service (`applyOwnershipChange`) is the only writer; it enforces exclusivity, roster capacity and category limits. Free agency is open only while no waiver window is.
- The **draft** is a live snake draft of selections, separate from the ceremony draft. Every pick writes ownership through `applyOwnershipChange`. Auto-draft takes only from the member's queue and never invents a pick; a missed pick gets one supplemental pick, and a second miss becomes a chip. Live changes go to the league's room in the `/circuits` Socket.IO namespace.
- The Circuit is independent of the Season: no foreign keys either way, and no imports between Circuit code and Season, draft, scoring or realtime code.

## Table map

| Table                 | What it holds                                                                                                                              | Key constraints                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `circuit`             | `code`, `name`, `status` (`DRAFT`, `ACTIVE`, `ARCHIVED`), `opens_on`                                                                       | `UNIQUE (code)`; `activated_at` is set when `ACTIVE`                                                                                                             |
| `circuit_event`       | Admin-made groups (`is_group`) and one-ceremony events, in top-level order (`sort_index`)                                                  | `UNIQUE (circuit_id, code)`; the code is admin-entered or generated from the name                                                                                |
| `circuit_category`    | Categories built from templates: name, icon and `kind` copied on add, `category_family_id` as the source template                          | `UNIQUE (circuit_id, code)`; `kind IN ('FILM','ACTING')`; `category_family_id` is `ON DELETE SET NULL`                                                           |
| `circuit_ceremony`    | Which ceremony belongs to which event, and its order inside it (`sort_index`)                                                              | PK `(circuit_id, ceremony_id)`; the event must belong to the same Circuit                                                                                        |
| `circuit_mapping`     | Ceremony category edition → Circuit category                                                                                               | PK `(circuit_id, category_edition_id)`: one edition maps to at most one Circuit category; many editions may map to the same                                      |
| `circuit_selection`   | A contender in a Circuit category: TMDB film id, TMDB person id for acting, local film and person                                          | `UNIQUE NULLS NOT DISTINCT (circuit_category_id, film_tmdb_id, person_tmdb_id)`; immutable (see Selections)                                                      |
| `circuit_league`      | One league's competition in a Circuit: status, roster size, draft type, pick clock, auto-draft, points                                     | `UNIQUE (circuit_id, league_id)`; `(status = 'SETUP') = (initialized_at IS NULL)`; see Leagues and membership                                                    |
| `circuit_league_*`    | `_event` (an enabled event and its weight), `_category` (weight, limit), `_member` (a player)                                              | Composite keys keep events and categories inside the league's own Circuit; a member row is unique per user                                                       |
| `circuit_transaction` | One roster change: `kind` (`DRAFT`, `SUPPLEMENTAL`, `WAIVER`, `FREE_AGENT`, `DROP`), member, add and drop selection, `occurred_at`, actor  | A `DROP` has no add, every other kind adds; draft and claim ids only on their kinds; never updated or deleted                                                    |
| `circuit_ownership`   | A half-open interval `[acquired_at, released_at)` of one member holding one selection                                                      | Partial unique `(circuit_league_id, selection_id) WHERE released_at IS NULL`; composite keys tie each boundary to its transaction's league, member and selection |
| `circuit_draft`       | A league's one draft: status, rounds, pick clock (`pick_timer_seconds`, default 90, 0 untimed), the pick on the clock, deadline, `version` | `UNIQUE (circuit_league_id)`; see The draft                                                                                                                      |
| `circuit_draft_seat`  | Seat order, one row per member                                                                                                             | `UNIQUE (draft_id, member_id)`; composite keys keep the member in the draft's league                                                                             |
| `circuit_draft_pick`  | One resolved slot: pick and original pick number, seat, member, `PICKED` or `MISSED`, selection, `MANUAL` or `AUTO`, request id            | `UNIQUE (draft_id, selection_id)`, `UNIQUE (draft_id, member_id, request_id)`; one supplemental pick per original pick                                           |
| `circuit_draft_event` | The draft's event log, one row per version                                                                                                 | `UNIQUE (draft_id, version)`                                                                                                                                     |
| `circuit_queue_item`  | A member's ranked queue of selections                                                                                                      | PK `(member_id, selection_id)`; `UNIQUE (member_id, position)`, deferred to commit                                                                               |
| `circuit_chip`        | A supplemental pick missed again, valued at its original pick number                                                                       | `UNIQUE (circuit_league_id, original_pick_number)`; consumption and expiry come with waivers                                                                     |

`circuit_ceremony` is the one shared association. The Circuit admin and the ceremony admin both read and write it; neither keeps a copy. Removing an association also removes that ceremony's mappings in the Circuit. A mapping is refused (409 `CIRCUIT_CEREMONY_NOT_ASSOCIATED`) until the edition's ceremony is associated.

- **Groups and single ceremonies.** Adding a ceremony creates a one-ceremony event named after it, at the end of the top level; the admin screens show it as a plain ceremony row. Add group creates an empty, admin-named group (`is_group`). A ceremony can move into a group, never into another ceremony's own event; its own event is deleted as it leaves. Taking a ceremony out of a group gives it a new one-ceremony event. Groups are never deleted for being empty. Deleting a group ungroups it: each of its ceremonies gets its own event again and keeps its mappings.
- **Categories.** A `FILM` template gives kind `FILM`, a `PERFORMANCE` template gives `ACTING`; `SONG` templates are rejected (400) and not offered on screen. Later template edits never change a Circuit category. Removing a category removes its mappings.
- **Scoring with many-to-one mappings.** A selection scores at most once per occasion, even when several mapped categories of one ceremony nominate it; each mapped category's winner is a separate win match. See [ADR 0006, section 5](../adr/0006-circuit-admin-defined-structure.md#5-scoring-with-many-to-one-mappings).

## Dates and scoring occasions

- `nominations_on` is a whole day (`date`, sent as `YYYY-MM-DD`). Admins can set it at any ceremony status, archived included. Editing it never changes a Circuit's status.
- The results date is derived, never entered: the date of `starts_at` in America/Los_Angeles (`resultsDateOf`). Responses carry it as a read-only `results_on`.
- A **scoring occasion** is `(ceremony, kind)` with `kind` `NOMINATION` or `WIN`. It is derived from the ceremony and its dates, never stored (`listScoringOccasions`). Dated occasions sort first, in date order, then undated ones in event order.
- **Ownership instant.** An occasion on day `D` is evaluated against ownership at `D 00:00 America/Los_Angeles`, the instant that day's waiver window opens. Nominations and wins on the same day share one instant. See [ADR 0005, section 3](../adr/0005-series-domain-model.md#3-scoring-occasions-and-dates).
- **Readiness** (`findCeremoniesMissingDates`) lists the associated ceremonies that lack a nominations date or a ceremony datetime. It is informational: activation proceeds regardless, and the Circuit admin shows the list.
- **Waiver windows** (`waiverWindows`, `apps/api/src/domain/waiverWindows.ts`) implement ADR 0005 section 9 as decided in ADR 0007. The Circuit admin detail returns `waiver_windows` from every associated ceremony's occasions, as if every ceremony were enabled; a league that disables some ceremonies gets fewer windows. A league's own windows come from `leagueWaiverWindows(occasions, enabledEventIds)`, and `waiverWindowAt(windows, at)` returns the window open at an instant, if any (see Ownership and transactions).

## Structural edits after activation

Owner question 6 is built to the recommended answer. Ceremonies, events, categories and mappings stay editable while a Circuit is `ACTIVE`. The admin screens ask for confirmation first (renames excepted, since they change no scoring), and every audit row records the Circuit status at the time of the edit. Only an `ARCHIVED` Circuit is read-only (409 `CIRCUIT_ARCHIVED`).

## Admin

Routes are listed in the [admin runbook](../runbooks/admin.md#circuit-admin-routes). Every write appends to `admin_audit_log`, with `target_type` `circuit`, or `ceremony` for date edits.

Screens:

- **Admin home → Game Content → Circuits**, and the admin nav's Game Content menu (`/admin/circuits`): the list of Circuits and a form to create one.
- **Circuit detail** (`/admin/circuits/:id`): activation and the missing-dates notice above three tabs; `?tab=categories|ceremonies|schedule` keeps the open tab in the URL.
  - **Categories**: a flat list. **Add category** copies a category template (templates are made on the Category Templates screen; nothing is seeded). Rename, remove, and reorder by drag and drop or the move buttons.
  - **Ceremonies**: **Add ceremony** appends any ceremony not yet in the Circuit, ungrouped; **Add group** creates an empty, admin-named group (the name players see). Single ceremonies show as plain rows, groups as collapsible containers. Rows and groups reorder by drag and drop; a ceremony joins or leaves a group by being dragged into or out of it. Each drag has a keyboard equivalent (focus the grip, Space, arrow keys, Space) and a row-menu item (move up or down, move into a group, move out of the group). Each ceremony row has **Map categories**.
  - **Mapping modal** (from **Map categories**): one row per Circuit category, each a multi-select of that ceremony's categories. A ceremony category chosen in one row is not offered in the others. Template matches are pre-selected; nothing is saved until **Save mappings**.
  - **Schedule**: read-only. Left, each ceremony's nominations and ceremony dates, labelled with its group where grouped; right, the add/drop windows from `waiverWindows` as if every ceremony were enabled. Ceremonies without dates are listed under **Needs dates**.
- **Ceremony admin, Initialize step** (`/admin/ceremonies/:id/overview`): the Foundation details form has one **Dates** section, the nominations date and the ceremony date and time, saved together. A **Circuits** panel attaches this ceremony to a Circuit (ungrouped) or detaches it, at every ceremony status; grouping and order are set in the Circuit editor.

## Public reads

`GET /circuits`, `/circuits/:id`, `/circuits/:id/events`, `/circuits/:id/categories` and `/circuits/:id/schedule`, returning the admin-defined events and categories. A `DRAFT` Circuit returns 404 and is left out of the list. Draft and deleted ceremonies are left out of events and the schedule.

## Contender search

Players pick contenders from TMDB before any nomination exists (`apps/api/src/routes/contenders.ts`, `services/contenderSearch.ts`).

- **Routes.** `GET /contenders/films/search?q=` (one TMDB `/search/movie` call, `include_adult=false`, no per-result enrichment) and `GET /contenders/films/:tmdbId/credits` (cast and crew from TMDB). Any TMDB film is returned: no release or eligibility filter.
- **Access.** Signed in, and a member of any league, or an operator. Membership narrows to Circuit leagues once they exist (package 04).
- **Query.** Normalised (NFC, whitespace collapsed, trimmed, lower-cased), then 2 to 100 characters, else 400. The normalised text is what TMDB receives and the cache key.
- **Limits.** Per route, sliding windows of one minute through the existing limiter: 30 requests per user and 120 per IP (the IP window runs before sign-in). Over the limit is 429 `RATE_LIMITED`. Limits are in process and reset on restart.
- **Cache.** In process, per instance: search results for 1 hour keyed on the normalised query, credits for 1 day keyed on the TMDB id, each bounded to 2,000 entries (oldest evicted). Failures are not cached.
- **TMDB failures** (all TMDB calls, admin included; `apps/api/src/lib/tmdb.ts`). Each call times out after 5 seconds. A timeout, network failure, missing token, or TMDB 429 or 503 is 503 `TMDB_UNAVAILABLE`; any other TMDB error or an unreadable body is 502 `TMDB_UPSTREAM_ERROR`; a TMDB 404 is 404 `TMDB_NOT_FOUND`. Clients get fixed messages; the upstream status and body go to the server log only.
- **Picks.** `POST /contenders/selections` upserts a selection (below) behind the same access check and its own pair of limits, since a new selection syncs the film from TMDB.

## Selections

A selection says a contender exists in a Circuit category (`circuit_selection`, migration `026`; ADR 0005 section 5). It carries no ownership and is shared by every league of the Circuit.

- **Identity.** `UNIQUE NULLS NOT DISTINCT (circuit_category_id, film_tmdb_id, person_tmdb_id)`. A `FILM` category takes no person; an `ACTING` category needs one (insert trigger `circuit_selection_check_kind`, plus a 400 from the service). So a film-only and an acting selection of one film, two people of one film in one acting category, and one person and film in two acting categories are all distinct rows.
- **Upsert** (`services/circuit/circuitSelections.ts`). Body `{ circuit_category_id, film_tmdb_id, person_tmdb_id? }`. An existing identity returns its row (200) with no TMDB call. A new one syncs the film, its people and credits through `syncTmdbMovieById`, then, for acting, requires the person in the stored `film_credit` rows (cast or crew); otherwise 422 `PERSON_NOT_IN_CREDITS`. Created is 201. Any TMDB film qualifies, released or not. A category of a `DRAFT` Circuit is 404; of an `ARCHIVED` one, 409 `CIRCUIT_ARCHIVED`. TMDB failures map as in Contender search.
- **Immutable.** No route or repository function updates a selection, and a `BEFORE UPDATE` trigger rejects any `UPDATE`. Changing a contender is a drop and a new pick. Deleting a Circuit category deletes its selections.

## Matching

`apps/api/src/domain/circuitMatching.ts` is pure. `matchOccasion` takes one scoring occasion (`NOMINATION` or `WIN`), the Circuit's mappings for the ceremony's categories, the ceremony's nominations (with their film and contributor TMDB ids), winners, films and selections. A nomination matches a selection when:

- its category edition is mapped, to the selection's Circuit category (unmapped editions never match);
- its film, after following `consolidated_into_film_id`, has the selection's `film_tmdb_id`;
- for `ACTING`, a contributor has the selection's `person_tmdb_id` (both ids are required);
- its status is `ACTIVE`, and, for a win, it is a `ceremony_winner`.

It returns at most one match per selection per occasion, listing every matching nomination, so two mapped categories nominating one film (Globes Drama and Comedy into Best Picture) score once. Different selections that each win a mapped category each match. Nothing calls it yet; scoring (a later package) will.

## Contender picker (web)

`features/contenders/ui/ContenderPicker.tsx` (render only) with `orchestration/contenders.ts` and `decisions/contenders.ts`: category (select), film (debounced search), then person from the credits for acting categories, then pick. Every control is a native input, select or button, and focus moves to the next step's control. TMDB attribution shows under film results and credits. Operators can try it at `/admin/circuits/:circuitId/picker` (a non-`DRAFT` Circuit). The roster screen mounts the same hook and component for free-agent adds.

## Leagues and membership

A league can hold a Season and a Circuit league at once; the two never share members (`circuit_league_member` is separate from `season_member`, and an integration test changes one and checks the other). Code is `domain/circuitLeague.ts` (pure), `data/repositories/circuitLeagueRepository.ts`, `services/circuit/circuitLeagues.ts`, `routes/circuitLeagues.ts` and `routes/leagues/circuitLeagues.ts`.

- **Defaults** (ADR 0005 section 4). Creating one enables every event of the Circuit with weight 1, gives every category weight 1 and no limit, and sets roster 16, 1 point per nomination, 2 per win, a 90-second pick clock and auto-draft on. A category added to the Circuit later reads as the defaults; an event added later reads as disabled.
- **Events toggle as units.** A grouped event (several ceremonies) is one row, so it is enabled or disabled whole. The events write replaces the enabled set; any subset, including none, saves.
- **Draft type** is stored (`SNAKE`) and not offered: snake is the only draft (owner questions 2 and 3).
- **Lifecycle.** `SETUP → INITIALIZED`, by a commissioner, with at least one member. The draft moves it to `DRAFTING` and then `IN_SEASON`; `COMPLETE` comes with scoring.
- **The initialisation guard.** `assertCircuitLeagueOpen` (409 `CIRCUIT_LEAGUE_LOCKED` outside `SETUP`) is the only check on member and event writes: join, leave, the events write and initialise all run inside `lockOpenCircuitLeague`, which locks the row `FOR UPDATE` and then calls the guard. `tests/unit/architecture/circuitLeagueGuard.test.ts` fails if any other file calls the guarded repository writes, and the integration suite has one locked test per route, each asserting the guard threw.
- **Settings after initialisation** (owner question 11). Everything is editable in `SETUP`. Once `INITIALIZED`, only the pick clock and auto-draft can change; roster, points, weights and limits are frozen (409 `CIRCUIT_LEAGUE_SETTINGS_LOCKED`). Nothing changes once the draft starts.
- **Who.** Any league member can read and join; non-members get 404, and a super admin who is not a member cannot join (403 `LEAGUE_MEMBERSHIP_REQUIRED`). League owners and co-owners (and the league creator) create, configure and initialise; the creator joins on create.

| Route                                 | Does                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GET /leagues/:id/circuits`           | The league's Circuit leagues, with Circuit name and status, member count and whether the viewer joined |
| `POST /leagues/:id/circuits`          | `{ circuit_id }` → 201 with the detail. A `DRAFT` Circuit is 404, `ARCHIVED` 409, a duplicate 409      |
| `GET /circuit-leagues/:id`            | The detail: settings, every event (enabled, weight, ceremonies), categories, members, viewer flags     |
| `PATCH /circuit-leagues/:id/settings` | Partial settings; the pick clock takes null or 0 for untimed                                           |
| `PUT /circuit-leagues/:id/events`     | `{ events: [{ circuit_event_id, weight? }] }`, the full enabled set                                    |
| `PUT /circuit-leagues/:id/categories` | `{ categories: [{ circuit_category_id, weight?, max_owned? }] }`; unlisted categories keep theirs      |
| `POST /circuit-leagues/:id/join`      | Join (`SETUP` only); also `/leave` and `/initialize`                                                   |

Every write returns the full detail.

**Web.** The league page lists Circuit leagues in its Seasons section, above the ceremony Seasons, and offers commissioners each active Circuit not yet started there (Start). Home's Active seasons lists the viewer's own Circuit leagues (joined, Circuit `ACTIVE`) above their Seasons. Both link to `/leagues/:leagueId/:leagueSlug/circuits/:circuitLeagueId`, the setup screen (`features/circuitLeagues`, `orchestration/circuitLeague.ts`, `decisions/circuitLeague.ts`): Join or Leave season under the header, settings that commissioners edit while they are open (players, and commissioners once a section is frozen, read the saved values as text), the member list, and Lock season in its own commissioner row (initialise, after a confirm). Players always read "season".

## Ownership and transactions

ADR 0005 section 7, under the ADR 0006 names. Code is `domain/circuitOwnership.ts` (pure interval and roster checks), `data/repositories/circuitOwnershipRepository.ts`, `services/circuit/circuitOwnership.ts` and the roster routes in `routes/circuitLeagues.ts`.

- **Intervals.** A member holds a selection over `[acquired_at, released_at)`. The owner at instant `t` is the member whose interval has `acquired_at <= t < released_at` (`ownerAt`, `isHeldAt`); a pick dropped at `t` is no longer held at `t`, and its next owner holds it from `t`. A dropped selection can be re-acquired at once, by anyone, its former owner included.
- **Append-only.** Triggers refuse any update of a transaction, any change to an interval other than closing it once, and any direct delete of either table. Deleting the league still cascades.
- **One writer.** `applyOwnershipChange(tx, league, { kind, memberId, addSelectionId, dropSelectionId, ... })` locks the member row (`SELECT … FOR UPDATE`), checks the drop is held, the add is in the league's Circuit and not held by anyone, the roster has room once the drop is counted out, and the category limit (`max_owned`). It then writes one transaction, closes the dropped interval and opens the added one. The partial unique index has the last word on exclusivity: a concurrent winner turns the loser's insert into 409 `CIRCUIT_SELECTION_TAKEN`. Packages 06 (`DRAFT`, `SUPPLEMENTAL`) and 08 (`WAIVER`) call the same function. `tests/unit/architecture/circuitOwnershipWriter.test.ts` fails if another file writes these tables.
- **The instant for a date.** A day `D` means `D 00:00 America/Los_Angeles` (`instantOfDay` in `domain/circuit.ts`), correct across daylight-saving changes. Scoring occasions, window opening and window resolution all use it.
- **The window rule.** Free agency is closed while a waiver window of the league is open: from `instantOfDay(starts_on)` until `instantOfDay(resolves_on)`. Windows are derived from the league's enabled events' current dates on every request, never stored. Drops are allowed at any time in season, inside a window too.
- **Status.** Player adds and drops need `IN_SEASON` (409 `CIRCUIT_LEAGUE_NOT_IN_SEASON`). `applyOwnershipChange` itself does not check status, so the draft can use it while `DRAFTING`.
- **Categories in use.** Removing a Circuit category that owned selections reference is refused (409 `CIRCUIT_CATEGORY_IN_USE`), since ownership history keeps its selections.

| Route                                             | Does                                                                                                                                                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /circuit-leagues/:id/roster`                 | The viewer's roster: member, status, `roster_size`, `free_agency { open, window }`, categories with `max_owned` and `owned`, and the held entries. 403 `CIRCUIT_MEMBERSHIP_REQUIRED` before joining |
| `GET /circuit-leagues/:id/members/:userId/roster` | Any member's roster, readable by any viewer of the league                                                                                                                                           |
| `POST /circuit-leagues/:id/drops`                 | `{ selection_id }`: drops at once; returns the roster                                                                                                                                               |
| `POST /circuit-leagues/:id/free-agents`           | `{ selection_id, drop_selection_id? }`: adds, dropping in the same transaction when given; refused inside a window (409 `CIRCUIT_WAIVER_WINDOW_OPEN`, `details.window`); returns the roster         |
| `GET /circuit-leagues/:id/transactions`           | The league's log, newest first: kind, `occurred_at`, member, added and dropped selection                                                                                                            |

Refusals are 409 unless noted: `CIRCUIT_ROSTER_FULL`, `CIRCUIT_CATEGORY_FULL`, `CIRCUIT_SELECTION_TAKEN`, `CIRCUIT_SELECTION_ALREADY_OWNED`, `CIRCUIT_SELECTION_NOT_OWNED`, and 404 for a selection from another Circuit. Viewers must be league members (or super admins); others get 404.

**Web.** Once the draft starts, the season screen links to the roster (`…/circuits/:circuitLeagueId/roster`, `?member=` for another player's) and the transaction log (`…/transactions`). Code is `orchestration/circuitRoster.ts`, `decisions/circuitRoster.ts` and `features/circuitLeagues` (`CircuitRosterScreen`, `CircuitTransactionsScreen`). The roster lists picks by category with counts against the limits; on the viewer's own roster each pick has Drop (after a confirm). Free agency shows an optional "Drop to make room" select above the contender picker; a pick is added as soon as the picker resolves it. At capacity, or at a category limit, the add waits for a drop to be chosen and is then retried with it, as one request. Inside a window the picker is replaced by the day free agency reopens.

## The draft

ADR 0005 section 6, under the ADR 0006 names. Code is `domain/circuitDraft.ts` (pure turn, slot, auto-pick and clock rules), `data/repositories/circuitDraftRepository.ts` and `circuitQueueRepository.ts`, `services/circuit/circuitDraft.ts`, `circuitQueue.ts` and `circuitNamespace.ts`, and the routes in `routes/circuitDrafts.ts` and `routes/circuitLeagues.ts`. The ceremony draft's tables, routes and sweeper query are untouched.

- **Start.** The league owner starts the one draft of an `INITIALIZED` league. Members are seated by a uniform Fisher–Yates shuffle (`shuffleUniformly`), rounds equal the roster size, pick 1 goes on the clock and the league moves to `DRAFTING`.
- **Turns.** Regular picks follow `getSnakeSeatForPick` (shared with the ceremony draft). After the regular rounds, each missed regular pick gets one supplemental pick, in original pick order, for the seat that missed it (owner question 1). The draft is `IN_PROGRESS`, then `SUPPLEMENTAL`, then `COMPLETED`, and the league moves to `IN_SEASON`.
- **Picks.** A pick is turn-checked, idempotent by `request_id` (a repeat returns the first pick, 200) and rate-limited to three attempts per member per draft in two seconds. Each pick writes its pick row and then calls `applyOwnershipChange` (`DRAFT`, or `SUPPLEMENTAL` in the supplemental round) in the same database transaction, so it writes one transaction and one interval and obeys the roster and category limits. A selection is drafted at most once per draft (`UNIQUE (draft_id, selection_id)`), and while `DRAFTING` nobody can drop or add one.
- **Queue.** Each member keeps a private ranked queue, editable at any time before and during the draft. Reordering must name exactly the queued set (409 `CIRCUIT_QUEUE_CHANGED` otherwise).
- **Clock and auto-draft.** The clock is the league's pick clock (90 seconds by default; 0 is untimed, and an untimed pick waits for its member). When it runs out, the draft sweeper's Circuit pass calls `tickCircuitDraft`. With auto-draft on, it takes the first queued selection, read at that moment, that nobody owns, nobody has drafted and that fits the member's roster and category limits. Skipped rows stay queued. If nothing fits, or auto-draft is off, the pick is `MISSED`. It never looks outside the queue. A supplemental pick missed again creates exactly one `circuit_chip` with the original pick number.
- **Pause and resume.** The league owner pauses a running draft; resume returns to `IN_PROGRESS` or `SUPPLEMENTAL` with the time that was left.
- **Concurrency.** Picks, ticks, pause and resume lock the draft row first, so they are serialised; a manual pick that lands before the tick wins, and the tick then finds nothing due.
- **Sweeper.** `startDraftSweeper(pool, passes)` runs each pass's expired-draft query and tick inside the ceremony sweeper's check, under the same advisory lock. `index.ts` registers `circuitDraftSweeperPass` and wires `registerCircuitDraftWake` to the sweeper's wake, because the two families never import each other.

**Events and reconnect.** Each change appends a `circuit_draft_event` and bumps `circuit_draft.version` in the same transaction. After commit the events are sent, in order, as `draft:event` to the league's room in the `/circuits` namespace (see [Runtime](runtime.md#realtime-drafting-socketio)). A message carries `draft_id`, `circuit_league_id`, `version`, `event_type`, `payload`, `created_at` and `server_time`. Every payload has `draft` (without `version`, which the message carries) and `on_the_clock`; some also have `pick`, `chip` or `seats`, with the same shapes as the snapshot.

| Event               | Extra payload                     |
| ------------------- | --------------------------------- |
| `draft.started`     | `seats`                           |
| `draft.pick.made`   | `pick`                            |
| `draft.pick.missed` | `pick`, `chip` (or null)          |
| `draft.paused`      | none                              |
| `draft.resumed`     | none                              |
| `draft.completed`   | none; follows the last pick event |

A client connects, then fetches the snapshot, applies messages with a higher `version` in order (replace `draft` and `on_the_clock`, append `pick` and `chip`), and fetches a new snapshot when it sees a gap. The snapshot is read under a share lock on the draft row, so its `version` matches the last event it includes.

| Route                                                                                             | Does                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /circuit-leagues/:id/draft`                                                                 | Starts the draft (league owner): `{ draft, seats }`, 201                                                                                                                   |
| `GET /circuit-leagues/:id/draft`                                                                  | The league's draft snapshot; 404 `CIRCUIT_DRAFT_NOT_STARTED` before the start                                                                                              |
| `GET /circuit-drafts/:id/snapshot`                                                                | `{ draft, seats, picks, on_the_clock, chips, server_time }`; `on_the_clock` is `{ pick_number, original_pick_number, seat_number, member_id, supplemental }` or null       |
| `POST /circuit-drafts/:id/picks`                                                                  | `{ selection_id, request_id }`: `{ pick, draft }`, 201 (200 for a repeated `request_id`); 409 `CIRCUIT_DRAFT_NOT_YOUR_TURN`, `CIRCUIT_DRAFT_PAUSED`; 429 when rate-limited |
| `POST /circuit-drafts/:id/pause`, `/resume`                                                       | League owner: `{ draft }`                                                                                                                                                  |
| `GET`, `POST`, `PUT /circuit-leagues/:id/queue`; `DELETE /circuit-leagues/:id/queue/:selectionId` | The viewer's queue: list, add `{ selection_id }` (201, or 200 when already queued), reorder `{ selection_ids }`, remove                                                    |

Reads are for league members (and super admins); others get 404. Picks and the queue need Circuit league membership (403 `CIRCUIT_MEMBERSHIP_REQUIRED`).

## Independence from the Season

- `apps/api/tests/integration/db/circuitSchema.integration.test.ts` queries `information_schema` and fails on any foreign key between a `circuit_*` table and the Season and ceremony-draft tables. It also proves the check catches one, by adding forbidden keys inside a rolled-back transaction.
- `eslint.config.mjs` blocks imports between API Circuit modules (`circuit*`) and Season, draft, auto-draft, scoring and realtime modules, in both directions. Circuit code may import the pure `domain/draftOrder` and `domain/draftPickRules`, which ADR 0005 section 1 says the Circuit draft reuses. `apps/api/tests/unit/architecture/circuitImportBoundary.test.ts` lints deliberate violations to keep the rule honest. So the `/circuits` namespace lives in `services/circuit/circuitNamespace.ts`, not `realtime/`; it shares only the socket session check in `auth/socketSession.ts` with the `/drafts` namespace, and `index.ts` wires it.
- The rule covers the API only. The web's Circuit admin code lives under `orchestration/admin/circuit`, `features/admin/{screens,ui}/circuit` and `decisions/admin/circuit.ts`, and imports no Season or draft code.
