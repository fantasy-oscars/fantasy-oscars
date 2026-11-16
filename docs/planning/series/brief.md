# Fantasy Oscars Circuit Competition

## Product and architecture brief

**Status:** Design brief reflecting decisions made through November 14, 2026  
**Scope:** Season-long awards competition alongside the existing ceremony-specific Fantasy Oscars game  
**Repository:** `fantasy-oscars/fantasy-oscars`

---

## 1. Product overview

The product will support a season-long fantasy competition spanning a curated set of awards ceremonies leading up to the Academy Awards, which serve as the finale. This is an additional game format, not a replacement for the existing single-ceremony Fantasy Oscars game.

The competition rewards forecasting across the awards season while keeping the ceremony slate and category universe standardized and manageable.

### Core principles

- Broad but curated ceremony coverage; avoid an overwhelming calendar or ceremony-specific nuance that makes contenders difficult to compare.
- Circuit categories are explicitly mapped to ceremony-specific categories.
- Participants draft contenders before all nominations are known.
- Ownership is exclusive and persists until a participant drops a selection.
- Only official nominations and wins score.
- Scoring accumulates across the season on one leaderboard.
- The game does not enforce awards eligibility or independently adjudicate real-world contender status.
- Existing ceremony records remain authoritative for nominations and results; TMDB records identify the films and people used by the game.

## 2. Product structure: Circuit and existing Seasons

### Circuit

A **Circuit** is the new higher-level competition spanning a season's selected ceremonies. It defines:

- The Circuit categories used by the competition.
- Which existing ceremonies belong to the Circuit.
- How ceremony-specific categories map to Circuit categories.
- The Circuit-wide scoring and event schedule.

A Circuit is not a renamed version of the existing `Season` entity.

**Vocabulary (2026-11-16).** This competition was first called a Series. It is a **Circuit** in code, tables and admin screens only; players see it as a **Season**, the same word as the single-ceremony competition. A person joins a season, whether it covers one ceremony or the whole run. Events stay **Events**, and a Circuit category is shown to players as a **Category** ([ADR 0006](../../adr/0006-circuit-admin-defined-structure.md)).

### Existing ceremony-specific Seasons

The existing `Season` entity continues to represent a league competition associated with one ceremony. It remains independent from a Circuit.

Circuits and existing Seasons should appear alongside one another in user-facing navigation, both labelled as seasons, and users should navigate them in similar ways. Similar navigation does not imply a shared domain model or lifecycle.

A ceremony may be associated with a Circuit while also being used by existing ceremony-specific Seasons. That association does not merge membership, drafts, rosters, scoring, or lifecycle.

## 3. Ceremony portfolio

Admins choose a Circuit's ceremonies and group them into events. Every ceremony in a Circuit belongs to exactly one event, and an event of several ceremonies is enabled as one unit. Nothing below is fixed: it is the default slate an admin builds for the 2026–27 season, five events with the four guild ceremonies grouped into one Guild event.

| Competition event      | Constituent organization / ceremony                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Critics Choice Awards  | Critics Choice Awards                                                                                                      |
| Golden Globe Awards    | Golden Globe Awards                                                                                                        |
| Guild Awards (grouped) | Actor Awards (formerly SAG Awards), Directors Guild Awards (DGA), Producers Guild Awards (PGA), Writers Guild Awards (WGA) |
| BAFTA Film Awards      | BAFTA Film Awards                                                                                                          |
| Academy Awards         | Academy Awards                                                                                                             |

### Configuration

- All of a Circuit's events are enabled by default.
- A league administrator may disable any event during setup.
- Any subset is allowed; there is no minimum number of events.
- An event of several ceremonies, such as the default Guild event, is selected as a single unit; its constituent ceremonies cannot be independently selected.
- Event selection locks when the Circuit season is established and cannot be changed midseason.
- All participants in a league use the same event schedule.

The selected events determine that league's scoring schedule.

### Category coverage

The portfolio is designed so each Circuit category has one pre-Oscar scoring opportunity from each of the four pre-Oscar competition events, plus the Academy Awards finale.

The default Guild event collectively supplies category coverage through its constituent ceremonies:

- Actor Awards: four acting categories.
- DGA: Best Director.
- PGA: Best Picture and Best Animated Feature.
- WGA: Best Screenplay.

The default Guild event contains four ceremonies. Each constituent ceremony can have separate nomination and award scoring occasions. Across the full default slate, there are five configurable competition events, eight constituent organizations/ceremonies, and fourteen nomination/award scoring occasions.

## 4. Circuit category universe

Admins build a Circuit's categories from category templates; film and performance templates are offered, song templates are not. The default slate is eight categories:

1. Best Picture
2. Best Director
3. Best Actor
4. Best Actress
5. Best Supporting Actor
6. Best Supporting Actress
7. Best Screenplay
8. Best Animated Feature

Best Screenplay combines Original and Adapted Screenplay into one Circuit category. International Feature, Documentary, technical categories, and other categories are left out of the default slate.

### Ceremony category mappings

- Every ceremony category included in the Circuit maps explicitly to one Circuit category.
- Mappings are configured, not inferred from category names.
- A ceremony need not provide every Circuit category.
- Different ceremony category labels may map to the same Circuit category, including several categories of one ceremony (many-to-one).
- For example, Golden Globe Best Actor – Drama and Best Actor – Musical or Comedy both map to Actor. They do not create separate selectable assets. A selection scores at most once per nomination occasion, even when several mapped categories of one ceremony nominate it; each mapped category's winner is a separate win match ([ADR 0006, section 5](../../adr/0006-circuit-admin-defined-structure.md#5-scoring-with-many-to-one-mappings)).
- When a ceremony category's template matches a Circuit category's template, the admin mapping screen pre-selects it; the mapping exists only once the admin saves it.

The selected ceremony's official nomination and award records determine whether a selection scores.

## 5. Selection model

A selection is a category-specific contender. The category is part of its identity.

### Film-only categories

These categories select a film:

- Best Picture
- Best Director
- Best Screenplay
- Best Animated Feature

Examples:

- _Hamnet_ — Best Picture
- _Hamnet_ — Best Director
- _Hamnet_ — Best Screenplay

Contributor credits may be displayed with ceremony nominations, but they are decorative. They do not affect selection identity, ownership, or scoring. For example, credited director(s) do not become part of the Best Director selection.

### Acting categories

Only the four acting categories select a person in the context of a particular film:

- Best Actor
- Best Actress
- Best Supporting Actor
- Best Supporting Actress

Example: _Hamnet_ — Best Actress — Jessie Buckley.

The film is required context. A person-category selection is not a free-standing person record.

### Selection identity and multiplicity

- Film-only selection identity: `(film, Circuit category)`.
- Acting selection identity: `(film, person, Circuit category)`.
- The same film can be selected in any number of Circuit categories.
- Multiple people from the same film can be selected in the same acting category.
- The same person-film combination can be selected in multiple acting categories; the Circuit categories remain distinct.
- The same person can be selected in the same category for different films; those are distinct selections.
- A particular exact selection can be owned by only one participant at a time.
- Two ceremony categories mapped to the same Circuit category do not create separate selectable assets.

### TMDB and person-film association

TMDB IDs are authoritative identifiers for films and contributors within the game model. TMDB records are the representation of truth used by the game and the source of rich metadata.

For acting selections:

- The person must appear in the selected film's TMDB credits.
- Any credit type qualifies; the system does not validate that the credit role is appropriate to the acting category.
- No participant-created exception or override is provided initially.
- If a legitimate contender is missing from TMDB credits, the issue can be handled if it arises.

For film-only categories, the film itself is sufficient; relevant contributor data does not need to exist in TMDB.

### Open film pool

Any film available through TMDB can be selected, regardless of release date or awards-eligibility period. The game will not enforce release windows or determine whether a film qualifies for a particular ceremony. Participants bear the risk of selecting an ineligible film. Actual ceremony nominations and results determine scoring.

### Immutability

Selections are immutable. A participant cannot edit a selection to point to another film or person. Changing a contender requires dropping the original selection and acquiring the new one through ordinary transaction rules.

A previously dropped selection can be reacquired under the same rules as any other available selection.

## 6. Nomination matching and scoring

### Exact identity matching

Ceremony nominations are matched to participant selections by exact underlying identity:

- Film-only categories: nominated film must match the selected film.
- Acting categories: nominated film and nominated person must both match.
- The ceremony category must map to the selection's Circuit category.

No fuzzy matching or automatic equivalence inference is part of ordinary scoring. Exceptional discrepancies between TMDB records or ceremony records and participant selections may be addressed through an administrative reconciliation mechanism. The detailed behavior remains deferred.

### Scoring events

Only two kinds of events score:

1. Official nomination.
2. Official win.

Shortlists, predictions, honorable mentions, and other forms of recognition do not score.

The same selection can earn points at multiple ceremonies over the season. Each ceremony counts independently.

### Ownership timing

Ownership is evaluated at the time of each scoring event:

- A participant who owns a selection when nominations are announced earns nomination points.
- If the selection is later dropped and acquired by someone else, the new owner can earn the win points if they own it when the winner is announced.
- Points already earned remain with the participant who earned them.
- No points are awarded retroactively for events that occurred before acquisition.
- If nominations and awards are announced together, both scoring events occur together.

### Default scoring values and customization

- Nomination: 1 point.
- Win: 2 additional points (3 total for a nominated winner).

The default scoring system is configurable per league. Administrators can customize nomination points, additional win points, Circuit category weights, ceremony/event weights, and other supported scoring weights and values. The system should be data-driven rather than hardcoded to one matrix.

### Standings

There is one cumulative season leaderboard. All scoring events contribute to the same total. The participant with the most points at the Academy Awards finale wins.

Individual ceremony results may be displayed, but they are not separate competitions or phase championships in the initial version.

## 7. League setup and season initialization

### Global opening

The platform establishes a global Circuit opening date, ideally early in the awards season. Once that date arrives, individual leagues may begin their chosen initialization process. The global opening date is permission to start, not a requirement that all leagues start on that date.

### League configuration

During setup, the administrator configures:

- Enabled competition events (all five enabled by default).
- Scoring values and weights.
- Roster size.
- Optional category-specific ownership limits.
- Draft format and draft settings.
- Supported waiver and acquisition settings.

Event selection locks when the Circuit season is established.

### Starting late

A league may initialize at any point during the awards season; there is no minimum runway requirement.

- Scoring events that have already occurred are in the past and do not award retroactive points.
- All subsequent scoring events count.
- Participants begin with the remaining selections available.
- A draft cannot take place while a ceremony's nominations or awards are in progress. Such events are treated as past for purposes of that draft.

### Membership and completion

League membership is fixed once the Circuit competition is initialized. There is no late joining after initialization.

There is no formal departure mechanism initially. If a participant abandons the game, they retain their roster and ownership; their selections continue to score. There is no automatic release, redistribution, or administrator removal workflow.

Completed Circuit competitions remain accessible as historical records using the general access pattern of existing Seasons. No special archival or expiration mechanism is required.

## 8. Rosters and ownership

### Roster structure and size

- Each participant has a flexible pool of selections.
- There are no required category distributions, starters, or bench.
- There are no category-specific roster slots.
- Category-specific maximums are optional league settings; the default is unlimited.
- Default roster limit: 16 selections per participant.
- The limit is configurable per league.
- The same limit applies throughout the competition: initial draft, later acquisitions, and all roster states.
- There is no temporary over-capacity allowance.
- Every owned selection occupies a roster slot until dropped.

### No system-enforced expiration

There is no selection expiration state. The system does not decide whether a contender has exhausted its scoring opportunities or is no longer viable. Participants are responsible for making that judgment.

There is no automatic release of selections after ceremonies or scoring opportunities have passed. Owned selections remain on the roster and occupy capacity until voluntarily dropped.

### Exclusive ownership

An exact selection can be owned by only one participant at a time. A dropped selection becomes available to everyone, including its former owner, subject to ordinary acquisition rules.

## 9. Draft

### Format and reuse

- The initial draft is live and synchronous.
- Participants take turns selecting contenders.
- Reuse existing draft-structure options where possible; audit current configuration before specifying extensions.
- Add auction drafts if not already supported.
- The selection flow is category → film → optional contributor selection.
- Reuse existing turn-taking, real-time updates, reconnect behavior, and draft history where possible.
- The existing application effectively supports snake order despite broader documentation; audit rather than assume.
- Existing pick-clock options are retained; default is 90 seconds.

### Crib sheet and auto-draft queue

Each participant has one ranked list of selections. This list serves both as a **crib sheet** for reference during the live draft and as the **auto-draft queue**, if auto-draft is enabled.

The list:

- Is useful even when auto-draft is disabled.
- Can be edited throughout the live draft.
- Supports adding, removing, and reordering selections.
- Is the current source for auto-draft, not a snapshot captured when the draft begins.

Auto-draft:

- Uses only the participant's preconfigured queue.
- Does not make random or system-suggested selections.
- Skips a queued selection if it is already owned by another participant, then tries the next item.
- Does not remove skipped unavailable selections from the queue.
- Stops when the queue is exhausted.
- If no queued selection can be made, the pick is treated as missed and follows the missed-pick process below.

A selection drafted by someone else will not become available again during the draft.

### Missed picks

Missed picks are not immediately forfeited:

- A missed pick is added to the back of the live draft queue.
- Each missed pick receives one one-time opportunity to be used after the live draft.
- If unused, that missed pick becomes a waiver priority chip.
- No extra picks are added indefinitely if the one-time supplemental opportunity is missed.

The chip is associated with the original missed pick. Earlier original pick positions produce more valuable chips.

## 10. Waivers and free agency

### Acquisition modes

- During a waiver window, acquisitions are submitted as claims and processed in a batch after the window closes.
- Outside waiver windows, available selections can be acquired immediately through free agency.
- There is no arbitrary per-cycle acquisition limit; roster capacity and ownership constraints govern acquisitions.

### Waiver windows

Waiver windows are organized around scoring events:

- A waiver window begins on the scoring-event day.
- It ends two days later, or one day after the last day in a consecutive block of scoring events, whichever is later.
- All waivers resolve at midnight Pacific time.
- After resolution, free agency is open until the next waiver block.
- Scoring event dates are treated as whole days; exact event start/end times are not required.
- Administrators can set and correct scoring event dates.
- If an event date is corrected during an active waiver window, handling should be innocuous; elaborate special-case behavior is not required.

### Waiver claims

- Participants can submit multiple ranked claims for different selections in one window.
- A participant may submit only one claim for a given selection in a given window.
- Claims remain private until processing.
- Claims can be edited or withdrawn until the window closes; once processing begins, claims are locked.
- Successful transactions and outcomes become visible after resolution.
- Claims are processed sequentially in priority order. Each successful claim updates ownership and roster state before the next claim is evaluated.
- Multiple claims from one participant can succeed in a cycle.
- If a claim fails, the roster remains unchanged and any attached chip is retained.

### Conditional drops and roster capacity

A claim may specify a selection to drop if the acquisition succeeds:

- The drop and acquisition execute atomically.
- If the claim fails, the roster remains unchanged.
- A claim does not require a conditional drop at submission, even if the participant is currently at capacity.
- At evaluation time, if the participant has roster space, the claim can succeed without a drop.
- If the participant is still at capacity and specified a conditional drop, the drop and acquisition execute atomically.
- If the participant is still at capacity and did not specify a drop, the claim fails.
- The interface should warn that a claim without a conditional drop may fail if the roster is still full at evaluation time.
- There is no automatic substitute drop. Each claim must explicitly identify its own conditional drop if one is intended.
- If multiple claims specify the same drop, they are evaluated sequentially. After the first successful claim drops that selection, a later claim referencing the same drop fails because the participant no longer owns it.

The same conditional add/drop behavior applies to immediate free-agent acquisitions. If a participant is at capacity, they must specify a drop; the add and drop execute atomically.

### Immediate drops and free agency

Drops are immediate and unconditional, including during waiver windows. Acquiring a selection during a waiver window still requires a waiver claim.

Free-agent acquisitions are immediate. Dropped selections become available immediately; there is no separate waiver lock on a dropped selection. No arbitrary transaction limit applies beyond roster capacity and exclusive ownership.

## 11. Waiver priority

Waiver priority is separate from missed-pick compensation.

### Ordinary rolling waiver priority

The league has a rolling priority order that applies to all claims:

- Initial priority is reverse draft order: the last participant in the draft receives first waiver priority.
- When a participant successfully acquires a selection through waivers, they move to the bottom of the rolling order.
- Failed claims do not change priority.
- If a participant wins multiple claims in one processing cycle, they move to the bottom once, after the entire cycle.
- Priority does not change midway through processing.

### Missed-pick chips

Chips compensate for missed draft opportunities; they are not the ordinary waiver priority system.

- Each missed pick produces a chip.
- Earlier original pick position means higher chip value.
- A participant can hold multiple chips and attach different chips to different claims in one cycle.
- A chip can be attached to only one claim at a time.
- A chip is consumed only if its claim succeeds; if the claim fails, the chip is retained.
- Participants may submit claims without chips even if they have chips available.
- Chips are visible to everyone in the league.
- All unused chips expire when the first waiver window closes.

### Claim ordering

1. Claims with chips are evaluated before claims without chips.
2. Among chipped claims, the claim with the earlier original draft pick position wins.
3. Among claims without chips, ordinary rolling waiver priority determines order.

Each chip corresponds to a distinct missed pick, so chip values are unique within the draft; no equal-value-chip tie-breaker is needed.

## 12. Ceremony and Circuit lifecycle

### Existing ceremony lifecycle

The intended ceremony statuses are:

1. `DRAFT`: Not visible to users; being prepared administratively.
2. `PUBLISHED`: Visible to users, but no league interaction yet.
3. `ACTIVE`: Visible and interactive for ceremony-specific participation.
4. `LOCKED`: Visible, but no longer interactive; winners have been announced / no further participation.
5. `ARCHIVED`: Removed from active listings but retained as a historical record.

`LOCKED` is not archival. `ARCHIVED` is not deletion.

A ceremony can be published early with only dates. Categories, nominations, and winners can be populated progressively. Lifecycle status is separate from content completeness.

The current database constraint does not include `ACTIVE`, while documentation and application behavior have inconsistencies around `COMPLETE` and other lifecycle concepts. This must be reconciled during implementation.

### Circuit lifecycle and activation

A Circuit must become active much earlier than its constituent ceremonies so that leagues can form, configure, and draft while ceremonies are still merely `PUBLISHED`.

Before Circuit activation, the system should check whether each constituent ceremony has dates for nominations and results:

- This is a soft readiness check, not a blocker.
- If dates are missing, show the administrator which ceremonies need them.
- The administrator may activate anyway.
- Dates can be added or corrected later.
- A later date change or removal does not automatically deactivate the Circuit.

The Circuit structure remains editable after activation because ceremony content is populated progressively.

Routine content completion (dates, categories, nominations, results) is distinct from structural changes (adding/removing ceremonies or changing mappings). Detailed rules for structural changes after activation remain deferred.

### Circuit/ceremony association

Existing ceremonies are associated with a Circuit through one shared relationship, manageable from either side:

- Circuit administration can add or remove existing ceremonies.
- Ceremony administration can associate or remove a Circuit.
- Both interfaces read and write the same underlying association.

A ceremony is expected to belong to at most one Circuit in ordinary use, but no hard database constraint enforcing that is required initially.

## 13. Administration and results

- Existing ceremony records remain authoritative for dates, categories, nominations, and winners.
- Existing administrative workflows are reused for entering nominations and results.
- No new result-ingestion or result-entry system is required initially.
- Existing winner records remain the source of truth for official outcomes.
- Existing administrative workflows already support centralized result entry shared by leagues using a ceremony.
- No post-event result-correction workflow is required for the initial version.
- Ceremony and nomination updates should continue to use administrative audit logging.
- Global administrators and existing `requireAdmin` patterns are sufficient initially; granular content-administration roles are not required.

### Exceptional selection reconciliation (deferred)

The system may need an administrator to reconcile a participant's TMDB-backed selection with an official nomination or result attached to a different TMDB record that a human regards as the same contender. The scope, ownership consequences, scoring effects, conflict handling, audit details, and sabotage protections have not been decided.

Do not preemptively build a global deduplication or equivalence database.

## 14. Architecture implications

### Reuse

Reuse existing subsystems where their responsibilities fit:

- Existing ceremonies and category records.
- Existing ceremony nominations and winner records.
- Existing film/person catalog and TMDB integration.
- Existing draft turn-taking, server authority, timers, real-time events, reconnect snapshots, and history patterns.
- Existing administrative result-entry and audit workflows.
- Existing league membership and user infrastructure where compatible with fixed Circuit membership.

### New or substantially revised capabilities

The Circuit competition requires new or revised capabilities for:

- Circuit entity and Circuit category definitions.
- Circuit-to-ceremony associations.
- Explicit ceremony-category-to-Circuit-category mappings.
- Circuit-specific league configuration and lifecycle.
- Category-specific contender selections independent of ceremony nominations.
- Public participant-facing film and contributor search.
- Persistent ownership history and roster transactions.
- Event-based scoring ledger, including ownership at each scoring event.
- Circuit standings calculation.
- Waiver claims and batch processing.
- Rolling waiver priority.
- Missed-pick chips.
- Immediate free-agent transactions.
- Circuit-aware draft pool and ranked crib-sheet/auto-draft queue.

### Existing-system constraints and repository findings

The current application is ceremony-centric:

- A current `Season` ties a league to one ceremony.
- A draft belongs to one existing Season.
- Draft picks reference ceremony nomination IDs.
- The current nomination model represents a film, song, or performance within a ceremony category.
- Existing scoring is based on draft picks and ceremony winners; it does not model independent nomination and win events with ownership evaluated separately.
- Existing `draft_pick` records are one-time picks, not durable roster ownership history.
- Existing waiver claims, priority, free agency, and transaction history do not exist.
- Existing participant-facing search is not sufficient for the new open contender pool.
- Existing auto-draft plans are ceremony-scoped and have fallback behaviors that are not appropriate here; the Circuit version must use only the participant's explicitly configured ranked queue.

The new selection model should not be forced into the existing ceremony `Nomination` model. A participant can select a contender before any ceremony nominates it. Ceremony nominations are scoring evidence that later match those selections.

### TMDB/catalog notes

The repository already has film consolidation/soft-merge support, TMDB film/person synchronization paths, film-credit data used by administrative nomination workflows, local search for stored films and people, and TMDB search endpoints primarily intended for administrators.

The new participant contender picker needs a supported public search path for films and, within a selected film, its TMDB credits. It should not require a ceremony nomination to exist.

### Real-time and transactional behavior

The existing draft runtime is server-authoritative and supports real-time updates and reconnect snapshots. Reuse those patterns for the new draft and add Circuit-specific updates for roster ownership changes, waiver processing results, scoring updates, and Circuit status/schedule changes.

Waiver processing must be transactional and sequential: each successful claim changes the state used to evaluate later claims in the same batch.

## 15. Deferred questions and explicit non-goals

The following areas are intentionally not settled and should not be inferred during implementation.

### Selection reconciliation

- How administrators reconcile distinct TMDB IDs that represent the same apparent contender.
- Whether reconciliation is scoped to one event, one Circuit, or permanent catalog identity.
- Ownership conflicts and scoring/point-transfer consequences.
- Audit presentation and anti-sabotage measures.

### Circuit structural edits after activation

- Rules for adding/removing ceremonies or changing mappings after leagues have initialized.
- Whether some structural changes require warnings, confirmation, or restrictions.

### Draft and acquisition details

- Exact supported draft-structure options after auditing current implementation.
- Auction draft behavior if it needs to be added.
- Exact behavior for a one-time post-draft missed-pick opportunity.
- Detailed configuration choices for acquisition mechanisms beyond the decided waiver/free-agency model.

### Calendar and scheduling

- Concrete calendar generation and validation using actual award-year dates.
- Examples for award years 2025, 2026, and 2027.
- Detailed handling of unusual schedule changes during an active waiver window.

### Explicitly out of scope initially

- Trades.
- Required category roster slots or starter/bench design.
- Automatic selection expiration.
- Automatic release or redistribution of abandoned participants' selections.
- Late joining after Circuit initialization.
- Automatic awards-eligibility enforcement.
- Fuzzy matching or global contender-equivalence inference.
- New result ingestion or post-event result correction workflows.
- Separate ceremony championships or phase leaderboards.

## 16. Suggested implementation sequence

This is a sequencing recommendation, not a commitment to a particular technical design.

1. **Audit and document existing behavior:** ceremony lifecycle/status inconsistencies; draft structure and pick-clock options; league/Season membership and initialization; catalog and TMDB search/credit behavior; scoring and result-entry workflows.
2. **Establish Circuit domain model:** Circuit and Circuit categories; ceremony associations and explicit mappings; Circuit lifecycle and league initialization; preserve independence from existing ceremony-specific Seasons.
3. **Build contender selection and search:** film-only and acting selection identities; participant-facing TMDB-backed film search; film-credit person selection for acting categories; exact identity matching against ceremony nominations.
4. **Build draft and roster ownership:** Circuit selection pool; live draft using reusable runtime; ranked crib sheet/auto-draft queue; missed-pick supplemental opportunity and chip creation; persistent ownership and transaction history.
5. **Build acquisition systems:** rolling waiver priority; missed-pick chip priority; waiver windows and batch claim evaluation; conditional add/drop; immediate free agency.
6. **Build scoring and standings:** event-based nomination and win ledger; ownership-at-event evaluation; configurable scoring matrix; one cumulative Circuit leaderboard.
7. **Complete administration and lifecycle:** Circuit setup and event configuration; activation readiness checks; ceremony association/mapping administration; real-time updates and audit coverage.
8. **Test critical invariants:** independence between Circuit and ceremony-specific Seasons; category mapping and exact selection matching; multiple independent selections; ownership changes between nomination and award events; sequential waiver claims and conditional add/drop; chip priority, consumption, and expiration; fixed membership and no retroactive scoring for past events.

## 17. Key invariants at a glance

- A Circuit and an existing ceremony-specific Season are separate domain concepts.
- Admins define a Circuit's ceremonies, events and categories; the default slate is eight categories and five events.
- Ceremonies grouped into one event are indivisible for leagues; the default Guild event contains Actor Awards, DGA, PGA, and WGA.
- Film-only categories select films; acting categories select a person in a particular film.
- Person selections require the person to appear in that film's TMDB credits; any credit type qualifies.
- Any TMDB film can be selected; release eligibility is not enforced.
- Selections are immutable and exclusive while owned.
- A film can be selected in multiple categories; multiple people can be selected from one film in one acting category.
- Only official nominations and wins score.
- Matching is exact by TMDB-backed identity and Circuit category.
- Ownership at each individual scoring event determines who receives those points.
- Default scoring is 1 for nomination and 2 additional for a win.
- All points feed one cumulative leaderboard.
- Default roster size is 16; category limits are optional and default to unlimited.
- No selection expiration state exists; owned selections occupy roster space until dropped.
- Draft is live and synchronous; default pick clock is 90 seconds.
- One ranked list is both the crib sheet and optional auto-draft queue.
- Auto-draft uses only that list and never invents a pick.
- Missed picks receive one supplemental opportunity, then become unique-value waiver chips if unused.
- Waivers resolve in batches around scoring-event blocks; free agency is immediate between windows.
- Rolling waiver priority starts in reverse draft order; successful waiver acquisitions move a participant to the bottom after the batch.
- Missed-pick chips outrank ordinary rolling priority and expire when the first waiver window closes.
- Waiver claims are private until resolution and editable until the window closes.
- Claims may omit a conditional drop, but can fail at evaluation if the roster is still full.
- League membership and event selection lock when the Circuit is initialized.
- Past scoring events never award retroactive points.
