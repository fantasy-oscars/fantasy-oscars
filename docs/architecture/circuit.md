# Circuit

A Circuit is a season-long competition across several awards ceremonies; players see it as a Season. The domain model and its reasoning are in [ADR 0005](../adr/0005-series-domain-model.md), as amended by [ADR 0006](../adr/0006-circuit-admin-defined-structure.md) and [ADR 0007](../adr/0007-circuit-groups-and-derived-dates.md); the build order is in the [plan](../planning/series/plan.md). This page describes what exists today: the foundation (migration `022_series_foundation.sql`, renamed and made admin-defined by `023_circuit_admin_structure.sql`, with groups and the derived results date from `025_circuit_groups_and_derived_results_date.sql`). Leagues, drafts, ownership, scoring and waivers come in later packages.

## TL;DR

- **Vocabulary.** Code, tables and admin screens say **Circuit**. Player-facing copy always says **Season**, for both competitions: a person joins a season, whether it covers one ceremony or the whole run. Admin events stay **Event**; a Circuit category is shown to players as **Category**. See [ADR 0006, section 1](../adr/0006-circuit-admin-defined-structure.md#1-vocabulary).
- A new Circuit is **empty**. Admins add any ceremonies, gather some into named **groups**, and build **Circuit categories** from category templates.
- Every associated ceremony belongs to exactly one event: a group, or its own one-ceremony event. Leagues enable and weight whole events.
- Admins **map** each ceremony category to at most one Circuit category; several ceremony categories may map to the same one (many-to-one). A matching template pre-selects the mapping on screen, but only an explicit save creates it. Nothing is inferred from names.
- Each ceremony has a **nominations date** (`ceremony.nominations_on`) and a **results date**, which is the date of its ceremony datetime (`ceremony.starts_at`) in America/Los_Angeles. Every associated ceremony gives two **scoring occasions**, one per date.
- **Activation** (`DRAFT → ACTIVE`) never waits for dates. It returns the associated ceremonies that still lack one.
- The Circuit is independent of the Season: no foreign keys either way, and no imports between Circuit code and Season, draft, scoring or realtime code.

## Table map

| Table              | What it holds                                                                                                     | Key constraints                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `circuit`          | `code`, `name`, `status` (`DRAFT`, `ACTIVE`, `ARCHIVED`), `opens_on`                                              | `UNIQUE (code)`; `activated_at` is set when `ACTIVE`                                                                        |
| `circuit_event`    | Admin-made groups (`is_group`) and one-ceremony events, in top-level order (`sort_index`)                         | `UNIQUE (circuit_id, code)`; the code is admin-entered or generated from the name                                           |
| `circuit_category` | Categories built from templates: name, icon and `kind` copied on add, `category_family_id` as the source template | `UNIQUE (circuit_id, code)`; `kind IN ('FILM','ACTING')`; `category_family_id` is `ON DELETE SET NULL`                      |
| `circuit_ceremony` | Which ceremony belongs to which event, and its order inside it (`sort_index`)                                     | PK `(circuit_id, ceremony_id)`; the event must belong to the same Circuit                                                   |
| `circuit_mapping`  | Ceremony category edition → Circuit category                                                                      | PK `(circuit_id, category_edition_id)`: one edition maps to at most one Circuit category; many editions may map to the same |

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
- **Waiver windows** (`waiverWindows`, `apps/api/src/domain/waiverWindows.ts`) implement ADR 0005 section 9 as decided in ADR 0007. The Circuit admin detail returns `waiver_windows` from every associated ceremony's occasions, as if every ceremony were enabled; a league that disables some ceremonies gets fewer windows.

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

## Independence from the Season

- `apps/api/tests/integration/db/circuitSchema.integration.test.ts` queries `information_schema` and fails on any foreign key between a `circuit_*` table and the Season and ceremony-draft tables. It also proves the check catches one, by adding forbidden keys inside a rolled-back transaction.
- `eslint.config.mjs` blocks imports between API Circuit modules (`circuit*`) and Season, draft, auto-draft, scoring and realtime modules, in both directions. Circuit code may import the pure `domain/draftOrder` and `domain/draftPickRules`, which ADR 0005 section 1 says the Circuit draft reuses. `apps/api/tests/unit/architecture/circuitImportBoundary.test.ts` lints deliberate violations to keep the rule honest.
- The rule covers the API only. The web's Circuit admin code lives under `orchestration/admin/circuit`, `features/admin/{screens,ui}/circuit` and `decisions/admin/circuit.ts`, and imports no Season or draft code.
