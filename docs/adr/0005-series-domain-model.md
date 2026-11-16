# ADR 0005: Series competition domain model

- Status: Accepted
- Date: 2026-11-16

## Context

The Series is a season-long competition across a curated slate of ceremonies, with the Academy Awards as the finale ([product brief](../planning/series/brief.md)). Participants draft category-specific contenders before nominations exist, own them exclusively until they drop them, trade through waivers and free agency, and score when a ceremony they own a contender in nominates or awards it.

The existing model is ceremony-centric. A Season ties a league to one ceremony, a draft belongs to one Season, and a pick references a ceremony nomination. Scoring is recomputed from picks and winners, with no ownership timing. The audit in [the plan, section 1](../planning/series/plan.md#1-audit-of-the-existing-system) lists the couplings: `draft.season_id NOT NULL`, `draft_pick.nomination_id NOT NULL` plus `UNIQUE (draft_id, nomination_id)`, and socket admission through `season_member`. None of them fit a contender that no ceremony has nominated yet.

The brief fixes the product rules (sections 2–12 and 17). This ADR fixes the tables, constraints and invariants that carry them, and how the Series stays independent of the existing Season. It does not decide anything the brief defers (section 15). Where a table has to leave room for a deferred rule, it says so.

## Decision

### 1. A separate `series_*` table family

All Series state lives in new tables prefixed `series_`. They may reference shared reference data: `app_user`, `league`, `league_member`, `ceremony`, `category_edition`, `nomination`, `nomination_contributor`, `ceremony_winner`, `film` and `person`. They never reference `season`, `season_member`, `season_invite`, `draft`, `draft_seat`, `draft_pick`, `draft_event`, `draft_plan` or `draft_result`, and no existing table gains a foreign key to a `series_*` table.

The Series draft is its own family too (`series_draft`, `series_draft_seat`, `series_draft_pick`, `series_draft_event`), not a nullable column on `draft`. It reuses the pure domain code (`apps/api/src/domain/draftOrder.ts`, `draftPickRules.ts`), the sweeper loop and its advisory lock, the event-versioning pattern and the socket session checks, but not the ceremony draft's tables or routes. Section 6 says why.

The only change to an existing table is two nullable date columns on `ceremony` (section 3). Migration `021_ceremony_lifecycle_active.sql` is a separate decision (plan section 1.1) and is not part of the Series schema.

### 2. Series, events, canonical categories

| Table             | Key columns                                                                                     | Constraints                                                                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `series`          | `id`, `code` (e.g. `2026-27`), `name`, `status`, `opens_on date`, `activated_at`, `archived_at` | `UNIQUE (code)`; `status IN ('DRAFT','ACTIVE','ARCHIVED')`; `activated_at IS NOT NULL` when `ACTIVE`                                                                       |
| `series_event`    | `id`, `series_id`, `code`, `name`, `sort_index`                                                 | `UNIQUE (series_id, code)`; `code IN ('CRITICS_CHOICE','GOLDEN_GLOBES','GUILDS','BAFTA','OSCARS')`. The Guild bundle is one event row, so it can only be enabled as a unit |
| `series_category` | `id`, `series_id`, `code`, `name`, `kind`, `sort_index`                                         | `UNIQUE (series_id, code)`; `code` is one of the eight canonical codes; `kind IN ('FILM','ACTING')`, fixed by code (the four acting categories are `ACTING`)               |
| `series_ceremony` | `series_id`, `ceremony_id`, `series_event_id`                                                   | PK `(series_id, ceremony_id)`; the event must belong to the same Series. No uniqueness on `ceremony_id` alone (brief section 12: no hard one-Series constraint)            |
| `series_mapping`  | `series_id`, `category_edition_id`, `series_category_id`                                        | PK `(series_id, category_edition_id)`: each ceremony category maps to at most one canonical category. The edition's ceremony must be in `series_ceremony` (service check)  |

- Creating a Series inserts its five events and eight categories in the same transaction. Categories and events are rows, not enums in code, so the scoring matrix can key on them; their codes are fixed so the brief's universe cannot drift.
- `series_ceremony` is the one shared association the brief asks for. Series admin and ceremony admin both read and write this table; neither keeps a copy.
- Mappings are explicit rows. Nothing infers a mapping from a category name.
- **Activation** sets `status = 'ACTIVE'` and `activated_at`. The readiness check (every associated ceremony has both dates) is a pure function that returns the missing ceremonies; activation does not depend on its result. Later date edits never change `status`.
- Structural edits after activation (adding or removing a ceremony, changing a mapping) stay possible at the database level. The rules for them are deferred (brief section 15); the admin routes log every such edit to `admin_audit_log` and the plan lists the rules as an owner question.

### 3. Scoring occasions and dates

A **scoring occasion** is `(ceremony, kind)` with `kind IN ('NOMINATION','WIN')`. It is not a table: it is derived from the ceremony and its dates.

- `ceremony.nominations_on date NULL` and `ceremony.results_on date NULL` (new). Whole days, editable by admins at any status, audit-logged.
- **Ownership instant.** An occasion on date `D` is evaluated against ownership at `D 00:00 America/Los_Angeles`, the same instant at which that day's waiver window opens (section 9). From then until the window resolves, no acquisition can happen, so whoever owns a contender at that instant owns it when the announcement is made that day. Drops made later that day do not take back points (brief section 6: points already earned stay earned).
- That one rule also covers the brief's edge cases:
  - Nominations and wins on the same day share the same instant, so they score together.
  - A league that drafts on an event day owns nothing at that day's instant, so the event is past for it.
  - A league that initialises late owns nothing before its draft, so nothing scores retroactively.

### 4. Leagues, membership, configuration

| Table                    | Key columns                                                                                                                                                                                                                                                                                             | Constraints                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `series_league`          | `id`, `series_id`, `league_id`, `status`, `roster_size` (default 16), `draft_type` (default `SNAKE`), `pick_timer_seconds` (default 90; null or 0 untimed), `auto_draft_enabled`, `nomination_points` (default 1), `win_bonus_points` (default 2), `initialized_at`, `created_by_user_id`, `created_at` | `UNIQUE (series_id, league_id)`; `status IN ('SETUP','INITIALIZED','DRAFTING','IN_SEASON','COMPLETE')`; `roster_size BETWEEN 1 AND 64`; `draft_type IN ('SNAKE','AUCTION')`; `initialized_at IS NOT NULL` once past `SETUP` |
| `series_league_event`    | `series_league_id`, `series_event_id`, `weight numeric DEFAULT 1`                                                                                                                                                                                                                                       | PK on both. A row means "enabled"; all five are inserted at create time                                                                                                                                                     |
| `series_league_category` | `series_league_id`, `series_category_id`, `weight numeric DEFAULT 1`, `max_owned integer NULL`                                                                                                                                                                                                          | PK on both; `max_owned IS NULL OR max_owned >= 1` (null is unlimited, the default)                                                                                                                                          |
| `series_league_member`   | `id`, `series_league_id`, `user_id`, `joined_at`, `waiver_priority integer NULL`                                                                                                                                                                                                                        | `UNIQUE (series_league_id, user_id)`; `UNIQUE (series_league_id, waiver_priority) DEFERRABLE INITIALLY DEFERRED`; the user must be a `league_member` of the same league (service check)                                     |

- A Series competition hangs off an existing league, as a Season does, so league ownership, invites to the league and `league_member` roles are reused. Series participation is its own membership table because `season_member`, season invites and draft seats all key on `season_id`.
- **Initialisation** moves `SETUP → INITIALIZED`, sets `initialized_at` and freezes membership and enabled events. One domain guard, `assertSeriesLeagueOpen(seriesLeague)`, is called by every path that adds or removes a member or changes enabled events, so a new route cannot skip it (the gap audit section 1.3 found in Season joins). Scoring weights, roster size and category limits are editable only in `SETUP`. Whether any of them may change after initialisation is an owner question; the default is no.
- Scoring settings are columns and rows rather than a JSON blob, so the matrix is data-driven (brief section 6) and constrained by the database. Points for an occasion are `base × category weight × event weight`, where `base` is `nomination_points` or `win_bonus_points`.
- Leaving and late joining do not exist (brief sections 7 and 15). An abandoned roster keeps scoring.

### 5. Selections and their identity

| Table              | Key columns                                                                                                    | Constraints                                                                                                                                                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `series_selection` | `id`, `series_category_id`, `film_tmdb_id integer`, `person_tmdb_id integer NULL`, `film_id`, `person_id NULL` | `UNIQUE NULLS NOT DISTINCT (series_category_id, film_tmdb_id, person_tmdb_id)` (Postgres 15+; production and tests run 18.6); `person_tmdb_id` and `person_id` are both null for `FILM` categories and both set for `ACTING` ones (trigger or service check against `series_category.kind`) |

- **Identity is TMDB-based.** A film-only selection is `(category, film tmdb id)`; an acting selection is `(category, film tmdb id, person tmdb id)`. The local `film_id` and `person_id` are there for metadata and joins; the unique key is on TMDB ids, so two local rows for one TMDB film cannot create two selections.
- **Rows are immutable.** No `UPDATE` path exists for a selection. "Changing" a contender is a drop and a new acquisition (brief section 5).
- **Rows are shared across leagues** of the same Series (the category is per Series). A row says only that this contender exists; it carries no ownership. Searching, queueing or claiming a contender upserts its row.
- **Acting validation.** On upsert of an acting selection, the person must appear in the film's stored TMDB credits (`film_credit`, any credit type). Credits are synced on demand through the existing `syncTmdbMovieById` path. There is no override.
- **Open pool.** Any TMDB film qualifies; nothing checks release windows or eligibility.

**Matching** is a pure function. Given an occasion and the active nominations in the ceremony's categories that have a `series_mapping`, a nomination matches selection `s` when:

- the edition maps to `s.series_category_id`;
- the nomination's film, after following `film.consolidated_into_film_id`, has `tmdb_id = s.film_tmdb_id`;
- for `ACTING`, one of its `nomination_contributor` people has `tmdb_id = s.person_tmdb_id`;
- only `nomination.status = 'ACTIVE'` counts.

A win matches the same way through `ceremony_winner`. One selection scores **at most once per occasion**, however many mapped categories nominate it (brief section 4: no double scoring paths). Nothing does fuzzy matching. Reconciling distinct TMDB records is deferred (brief section 15) and has no table here.

### 6. Draft

| Table                | Key columns                                                                                                                                                                       | Constraints                                                                                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `series_draft`       | `id`, `series_league_id`, `status`, `draft_type`, `rounds`, `pick_timer_seconds`, `current_pick_number`, `pick_deadline_at`, `version`, `started_at`, `completed_at`, `paused_at` | `UNIQUE (series_league_id)`; `status IN ('PENDING','IN_PROGRESS','PAUSED','SUPPLEMENTAL','COMPLETED','CANCELLED')`                                                                                                        |
| `series_draft_seat`  | `draft_id`, `seat_number`, `member_id`                                                                                                                                            | PK `(draft_id, seat_number)`; `UNIQUE (draft_id, member_id)`                                                                                                                                                              |
| `series_draft_pick`  | `id`, `draft_id`, `pick_number`, `original_pick_number`, `seat_number`, `member_id`, `outcome`, `selection_id NULL`, `source`, `request_id`, `made_at`                            | `UNIQUE (draft_id, pick_number)`; `UNIQUE (draft_id, selection_id)`; `outcome IN ('PICKED','MISSED')`; `selection_id IS NOT NULL` iff `PICKED`; `source IN ('MANUAL','AUTO')`; `UNIQUE (draft_id, member_id, request_id)` |
| `series_draft_event` | `id`, `draft_id`, `version`, `event_type`, `payload jsonb`, `created_at`                                                                                                          | `UNIQUE (draft_id, version)`                                                                                                                                                                                              |
| `series_queue_item`  | `member_id`, `selection_id`, `position`                                                                                                                                           | PK `(member_id, selection_id)`; `UNIQUE (member_id, position) DEFERRABLE INITIALLY DEFERRED`                                                                                                                              |

- **Order.** Snake, through the existing `getSnakeSeatForPick`. `rounds = roster_size`. Seats are shuffled uniformly (Fisher–Yates; the Season shuffle's bias, audit 1.6, is not copied).
- **One queue per participant** (`series_queue_item`) is both the crib sheet and the auto-draft source. It is read live at each auto-pick, never snapshotted. It is editable throughout the draft. A pick by anyone never removes a queue row; unavailable rows are skipped.
- **Auto-draft** walks the queue in `position` order and takes the first selection that is not owned in this league and fits the roster and category limits. If none qualifies, the pick is `MISSED`. It never falls back to a random, suggested or first-available pick. That is the difference from `apps/api/src/services/drafting/autoPick.ts`, so the Series auto-pick is new code, not a strategy flag on the old one.
- **Missed picks.** A `MISSED` row keeps its `original_pick_number`. The live draft appends one supplemental pick per missed pick at the end of the sequence (`status = 'SUPPLEMENTAL'` while those run), carrying the original number. A supplemental pick that is missed again creates a chip (section 9) and nothing more. The exact supplemental mechanics are deferred (brief section 15); the plan recommends this shape and lists it as an owner question, and the columns above support either answer.
- **Auction** is reserved by `draft_type = 'AUCTION'`. Its behaviour is deferred (brief section 15). Its tables (`series_auction_lot`, `series_auction_bid`, per-member budget) are specified by its own package once the owner answers the auction questions. A snake draft never touches them.
- **Every successful pick writes ownership** in the same transaction (section 7). The draft pick row is history; ownership is the state.
- **Real-time.** A new `/series` Socket.IO namespace, admitting only `series_league_member`s of the room's league. Events are versioned per draft as today. Reconnect uses `GET /series-drafts/:id/snapshot`. League-level events (roster changes, waiver results, scoring updates, schedule changes) use the same namespace with a per-league room.

**Why a separate draft family rather than extending `draft`.** Extending `draft` means making `season_id` and `nomination_id` nullable with exclusive-or checks, and branching the snapshot, socket admission, sizing, auto-pick and sweeper paths of the live ceremony game. All of that in the months the Oscars ceremony game is in use. The Series pick needs a different uniqueness key (selection, not nomination), a different auto-pick contract, supplemental picks, and later auction state. The shared parts are pure functions and patterns, which can be imported without sharing tables.

### 7. Ownership history and transactions

| Table                | Key columns                                                                                                                                                             | Constraints                                                                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `series_transaction` | `id`, `series_league_id`, `member_id`, `kind`, `add_selection_id NULL`, `drop_selection_id NULL`, `draft_pick_id NULL`, `claim_id NULL`, `occurred_at`, `actor_user_id` | `kind IN ('DRAFT','SUPPLEMENTAL','WAIVER','FREE_AGENT','DROP')`; at least one of add and drop; `DROP` has no add; `DRAFT` and `SUPPLEMENTAL` have a `draft_pick_id` and no drop; `WAIVER` has a `claim_id`; append-only |
| `series_ownership`   | `id`, `series_league_id`, `member_id`, `selection_id`, `acquired_at`, `acquired_transaction_id`, `released_at NULL`, `released_transaction_id NULL`                     | Partial `UNIQUE (series_league_id, selection_id) WHERE released_at IS NULL`; `released_at IS NULL OR released_at >= acquired_at`; `released_*` both null or both set                                                    |

- Ownership is a set of **half-open intervals** `[acquired_at, released_at)`. Rows are never deleted. The only update is closing an open interval by setting `released_at`, once.
- **Exclusive ownership.** At most one open interval per (league, selection), enforced by the partial unique index. Intervals for one (league, selection) never overlap, because a new interval can only open after the previous one closed (same index), and both timestamps come from the transaction's `now()`. Exclusion constraints over `tstzrange` would also prove non-overlap, but they need the `btree_gist` extension; the partial index plus append-only writes is enough here.
- **Roster capacity.** Open intervals per member never exceed `roster_size`, and per category never exceed `max_owned`. Every acquisition path locks the member row (`SELECT … FOR UPDATE`) and counts in the same transaction. An add at capacity needs a drop in the same transaction, and the add and drop are one `series_transaction` row. There is no over-capacity state, not even transiently: within the transaction the drop closes before the add opens.
- **Drops** are immediate and allowed at any time, including during waiver windows. A dropped selection is available to everyone at once.
- **Ownership at an instant** `t`: rows with `acquired_at <= t AND (released_at IS NULL OR released_at > t)`. Scoring is therefore a pure function of (intervals, occasion instant, matches, matrix).
- **Free agency**: an immediate `FREE_AGENT` transaction, allowed only while no waiver window is open for the league.

### 8. Scoring ledger and standings

| Table                | Key columns                                                                                                                                         | Constraints                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `series_score_entry` | `id`, `series_league_id`, `member_id`, `selection_id`, `ceremony_id`, `kind`, `occasion_date`, `points numeric(8,2)`, `ownership_id`, `computed_at` | `UNIQUE (series_league_id, selection_id, ceremony_id, kind)`; `kind IN ('NOMINATION','WIN')` |

- The ledger is the **materialised output** of a pure function, `scoreOccasion(intervals, occasion, matches, matrix) → entries`. It is rebuilt per (league, ceremony, kind) in one transaction (delete, then insert) whenever that ceremony's nominations, winners or dates change, or its enabled event or mapping changes. Rebuilds are deterministic and idempotent.
- A nominated winner earns `nomination_points` for its nomination occasion (to whoever owned it then) plus `win_bonus_points` for its win occasion (to whoever owns it then). A win owner who did not own the nomination gets only the win bonus.
- Occasions whose date is null do not score until a date is entered. Occasions of disabled events never score for that league.
- **Standings** are `SUM(points)` per member over the ledger, one cumulative table; per-ceremony breakdowns are views over the same rows.
- Because the ledger is derived, it can be built or rebuilt at any time from ownership history, which is the property the plan's fallback order relies on.

### 9. Waiver windows, claims, priority and chips

**Windows are derived, not stored.** A pure function takes the league's enabled occasions with dates and returns windows:

- a window opens on a scoring day `D`;
- consecutive scoring days form a block `[D, L]`;
- the window covers `D` through `max(D + 2, L + 1)`;
- a scoring day that falls inside an open window extends it to cover `max(current end, day + 2)`;
- the window resolves at 00:00 America/Los_Angeles after its last day;
- there is no window after the league's final occasion.

The merge rule for overlapping windows is not in the brief; it is the plan's recommended answer to an owner question.

| Table                 | Key columns                                                                                                                                                                                                  | Constraints                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `series_waiver_run`   | `id`, `series_league_id`, `window_starts_on date`, `window_ends_on date`, `status`, `started_at`, `completed_at`, `priority_before jsonb`, `priority_after jsonb`                                            | `UNIQUE (series_league_id, window_starts_on)`; `status IN ('RUNNING','COMPLETED')`                                                                                                                                                                                             |
| `series_waiver_claim` | `id`, `series_league_id`, `member_id`, `window_starts_on date`, `selection_id`, `drop_selection_id NULL`, `chip_id NULL`, `rank`, `status`, `failure_reason NULL`, `run_id NULL`, `created_at`, `updated_at` | `status IN ('PENDING','WON','LOST','WITHDRAWN')`; partial `UNIQUE (series_league_id, member_id, window_starts_on, selection_id) WHERE status <> 'WITHDRAWN'`; partial `UNIQUE (chip_id) WHERE status = 'PENDING' AND chip_id IS NOT NULL`; `drop_selection_id <> selection_id` |
| `series_chip`         | `id`, `series_league_id`, `member_id`, `original_pick_number`, `status`, `created_at`, `consumed_claim_id NULL`, `expired_at NULL`                                                                           | `UNIQUE (series_league_id, original_pick_number)`; `status IN ('AVAILABLE','CONSUMED','EXPIRED')`                                                                                                                                                                              |

- **Privacy.** Claims are visible only to their owner while `PENDING`. They are editable and withdrawable until the window's resolution instant; the processor takes a league-level lock first, after which edits are refused. Outcomes and the resulting transactions are visible to the league after the run completes.
- **Chips** are visible to everyone. Each comes from one missed pick, and its value is its `original_pick_number` (lower is better, unique per league, so no tie-breaker). A chip is attached to at most one pending claim. It is consumed only when its claim wins, and kept when the claim loses. All `AVAILABLE` chips become `EXPIRED` when the league's first waiver window resolves (in the same run, after its claims).
- **Rolling priority.** `series_league_member.waiver_priority`: 1 is first. It starts in reverse draft order (the last seat gets 1). After a run, every member who won at least one claim moves to the bottom once, keeping their relative order. Failed claims change nothing. Priority does not change mid-run.
- **Processing** is one database transaction per (league, window), idempotent through `series_waiver_run`'s unique key. Order:
  1. Chipped claims by `original_pick_number`.
  2. Then unchipped claims by the member's rolling priority.
  3. Within one member, by their `rank`.

  Each claim is evaluated against the state left by the previous one:
  - fails if the selection is owned;
  - fails if the `drop_selection_id` is no longer owned by the claimant;
  - fails if the claimant is at capacity with no drop;
  - fails if a category limit would be exceeded;
  - otherwise closes the drop interval and opens the add interval as one `WAIVER` transaction, and consumes its chip.

  Priority is rewritten once at the end.

- **The scheduler** reuses the sweeper pattern: a process-wide loop under its own advisory lock finds leagues with an unresolved window whose resolution instant has passed and runs them. A missed tick catches up on the next one, so an outage delays processing but never skips it.

### 10. Independence from the existing Season

- No foreign key in either direction between `series_*` and the Season and draft tables listed in section 1.
- The existing Season, draft, scoring and realtime code does not import Series modules, and Series code does not import Season repositories. An architecture test enforces both directions with import-path rules, alongside a schema test that queries `information_schema` for forbidden foreign keys.
- Ceremony actions keep their side effects on ceremony-specific drafts only. Entering a winner locks the ceremony and cancels in-progress ceremony drafts (`apps/api/src/routes/admin/winnersUpsert.ts:93-107`), and never touches a `series_draft`. Series scoring reacts to the same writes by rebuilding the ledger, not by changing ceremony status.
- A league may run a Season and a Series at once. Each has its own membership, draft, roster and scoring.

### Invariants

1. One open ownership per (league, selection); intervals for a (league, selection) never overlap.
2. Open ownership per member never exceeds `roster_size`, nor `max_owned` in any category, at any committed state.
3. Selections are never updated; identity is `(category, film tmdb id[, person tmdb id])` and is unique.
4. An acting selection's person is in the film's stored TMDB credits; a film-only selection has no person.
5. Every ownership change has exactly one `series_transaction`, and every interval boundary points at one.
6. Points for an occasion depend only on ownership at that occasion's instant, the matches and the league's matrix; rebuilding the ledger yields the same rows.
7. One selection scores at most once per (ceremony, kind) per league.
8. No points for an occasion whose instant precedes the league's first ownership.
9. Membership and enabled events do not change after `initialized_at`.
10. Waiver processing is sequential within a run; claims are hidden until it completes; priority changes once per run; chips are consumed only on success and all expire with the first window.
11. Auto-draft only ever picks from the participant's queue.
12. No `series_*` row references a Season or ceremony-draft row, and vice versa.

## Alternatives Considered

- **Extend `draft` and `draft_pick` with nullable Series columns.** Reuses the runtime with fewer new routes. Rejected: it changes constraints and code paths of the live ceremony game during the season, mixes two uniqueness keys and two auto-pick contracts in one table, and leaves no clean home for auction state (section 6).
- **Model a Series league as a Season with a flag** (the pattern ADR 0002 used for public seasons). Rejected: a Season ties to one ceremony, and its membership, draft sizing and scoring all assume that. The brief says a Series is not a renamed Season.
- **Store ownership as current state only, plus an event log.** Simpler writes. Rejected: scoring at a date would need log replay. Intervals make "who owned it at `t`" one indexed query and the ledger a pure function.
- **Compute scores on read, no ledger** (as ceremony standings do today). Rejected as the only mechanism: Series standings join intervals, mappings, nominations and winners across eight ceremonies and many leagues. The ledger is materialised but derived, so it keeps the "recompute from truth" property.
- **Key selections on local `film_id` and `person_id`.** Rejected: the brief makes TMDB ids authoritative, and local rows can be consolidated.
- **Store waiver windows as rows.** Rejected: dates are admin-correctable at any time. Deriving windows from dates on each read keeps a corrected date "innocuous" (brief section 10) without a sync step; only completed runs are stored.

## Consequences

- Positive: the ceremony game's tables and code paths stay untouched, apart from two nullable date columns. Scoring is a testable pure function. The ledger can ship after drafting starts without losing anything, as long as ownership intervals are written from the first pick.
- Positive: every brief invariant maps to a constraint or to one guarded code path, which keeps the invariant test plan short.
- Negative: a second draft family duplicates repositories, routes and the draft-room glue layer. The pure domain code and UI primitives are shared, but the room is a new screen.
- Negative: the derived waiver windows and the 00:00 Pacific ownership instant are conventions players have to be told; the Series rules page must state them.
- Follow-ups: owner answers on supplemental picks, auction, window merging, chip expiry for late leagues and post-initialisation settings ([plan, owner questions](../planning/series/plan.md#9-owner-questions)). The auction tables come with the auction package. Selection reconciliation stays deferred, and nothing here precludes it.
