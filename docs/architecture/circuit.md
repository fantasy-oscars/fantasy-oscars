# Circuit

A Circuit is a season-long competition across several awards ceremonies; players see it as a Season. The domain model and its reasoning are in [ADR 0005](../adr/0005-series-domain-model.md), as amended by [ADR 0006](../adr/0006-circuit-admin-defined-structure.md); the build order is in the [plan](../planning/series/plan.md). This page describes what exists today: the foundation (migration `022_series_foundation.sql`, renamed and made admin-defined by `023_circuit_admin_structure.sql`). Leagues, drafts, ownership, scoring and waivers come in later packages.

## TL;DR

- **Vocabulary.** Code, tables and admin screens say **Circuit**. Player-facing copy always says **Season**, for both competitions: a person joins a season, whether it covers one ceremony or the whole run. Admin events stay **Event**; a Circuit category is shown to players as **Category**. See [ADR 0006, section 1](../adr/0006-circuit-admin-defined-structure.md#1-vocabulary).
- A new Circuit is **empty**. Admins add any ceremonies, group them into **events**, and build **Circuit categories** from category templates.
- Every associated ceremony belongs to exactly one event. Leagues enable and weight whole events.
- Admins **map** each ceremony category to at most one Circuit category; several ceremony categories may map to the same one (many-to-one). A matching template pre-selects the mapping on screen, but only an explicit save creates it. Nothing is inferred from names.
- Each ceremony has a **nominations date** and a **results date** (`ceremony.nominations_on`, `ceremony.results_on`). Every associated ceremony gives two **scoring occasions**, one per date.
- **Activation** (`DRAFT → ACTIVE`) never waits for dates. It returns the associated ceremonies that still lack one.
- The Circuit is independent of the Season: no foreign keys either way, and no imports between Circuit code and Season, draft, scoring or realtime code.

## Table map

| Table              | What it holds                                                                                                     | Key constraints                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `circuit`          | `code`, `name`, `status` (`DRAFT`, `ACTIVE`, `ARCHIVED`), `opens_on`                                              | `UNIQUE (code)`; `activated_at` is set when `ACTIVE`                                                                        |
| `circuit_event`    | Admin-defined groups of one or more ceremonies, in display order                                                  | `UNIQUE (circuit_id, code)`; the code is admin-entered or generated from the name                                           |
| `circuit_category` | Categories built from templates: name, icon and `kind` copied on add, `category_family_id` as the source template | `UNIQUE (circuit_id, code)`; `kind IN ('FILM','ACTING')`; `category_family_id` is `ON DELETE SET NULL`                      |
| `circuit_ceremony` | Which ceremony belongs to which event                                                                             | PK `(circuit_id, ceremony_id)`; the event must belong to the same Circuit                                                   |
| `circuit_mapping`  | Ceremony category edition → Circuit category                                                                      | PK `(circuit_id, category_edition_id)`: one edition maps to at most one Circuit category; many editions may map to the same |

`circuit_ceremony` is the one shared association. The Circuit admin and the ceremony admin both read and write it; neither keeps a copy. Removing an association also removes that ceremony's mappings in the Circuit. A mapping is refused (409 `CIRCUIT_CEREMONY_NOT_ASSOCIATED`) until the edition's ceremony is associated.

- **Events.** Adding a ceremony without an event creates a one-ceremony event named after it. Moving a ceremony into another event deletes the event it leaves when that event is now empty. Deleting an event ungroups it: each of its ceremonies gets its own event again and keeps its mappings.
- **Categories.** A `FILM` template gives kind `FILM`, a `PERFORMANCE` template gives `ACTING`; `SONG` templates are rejected (400) and not offered on screen. Later template edits never change a Circuit category. Removing a category removes its mappings.
- **Scoring with many-to-one mappings.** A selection scores at most once per occasion, even when several mapped categories of one ceremony nominate it; each mapped category's winner is a separate win match. See [ADR 0006, section 5](../adr/0006-circuit-admin-defined-structure.md#5-scoring-with-many-to-one-mappings).

## Dates and scoring occasions

- `nominations_on` and `results_on` are whole days (`date`, sent as `YYYY-MM-DD`). Admins can set them at any ceremony status, archived included. Editing them never changes a Circuit's status.
- A **scoring occasion** is `(ceremony, kind)` with `kind` `NOMINATION` or `WIN`. It is derived from the ceremony and its dates, never stored (`listScoringOccasions`). Dated occasions sort first, in date order, then undated ones in event order.
- **Ownership instant.** An occasion on day `D` is evaluated against ownership at `D 00:00 America/Los_Angeles`, the instant that day's waiver window opens. Nominations and wins on the same day share one instant. See [ADR 0005, section 3](../adr/0005-series-domain-model.md#3-scoring-occasions-and-dates).
- **Readiness** (`findCeremoniesMissingDates`) lists the associated ceremonies that lack either date. It is informational: activation proceeds regardless, and the Circuit admin shows the list.

## Structural edits after activation

Owner question 6 is built to the recommended answer. Ceremonies, events, categories and mappings stay editable while a Circuit is `ACTIVE`. The admin screens ask for confirmation first (renames excepted, since they change no scoring), and every audit row records the Circuit status at the time of the edit. Only an `ARCHIVED` Circuit is read-only (409 `CIRCUIT_ARCHIVED`).

## Admin

Routes are listed in the [admin runbook](../runbooks/admin.md#circuit-admin-routes). Every write appends to `admin_audit_log`, with `target_type` `circuit`, or `ceremony` for date edits.

Screens:

- **Admin home → Game Content → Circuits**, and the admin nav's Game Content menu (`/admin/circuits`): the list of Circuits and a form to create one.
- **Circuit detail** (`/admin/circuits/:id`):
  - activation, with the missing-dates notice;
  - **Ceremonies**: add any ceremony, with or without an event; events listed in order with rename, move up and down, and ungroup; each ceremony can move to another event or to its own, or be removed; a form groups chosen ceremonies into a new event;
  - **Categories**: add from a category template, rename, move up and down, remove;
  - **Category mappings**: one choice per ceremony category, pre-selected from a matching template, saved together with **Save mappings**; unsaved choices are marked, and a **By Circuit category** list shows every ceremony category mapped to each Circuit category;
  - **Schedule** of occasions.
- **Ceremony admin, Initialize step** (`/admin/ceremonies/:id/overview`): a **Circuit dates** form and a **Circuits** panel that adds this ceremony to a Circuit (with or without an event), moves it to another event, or removes it. Both work at every ceremony status.

## Public reads

`GET /circuits`, `/circuits/:id`, `/circuits/:id/events`, `/circuits/:id/categories` and `/circuits/:id/schedule`, returning the admin-defined events and categories. A `DRAFT` Circuit returns 404 and is left out of the list. Draft and deleted ceremonies are left out of events and the schedule.

## Independence from the Season

- `apps/api/tests/integration/db/circuitSchema.integration.test.ts` queries `information_schema` and fails on any foreign key between a `circuit_*` table and the Season and ceremony-draft tables. It also proves the check catches one, by adding forbidden keys inside a rolled-back transaction.
- `eslint.config.mjs` blocks imports between API Circuit modules (`circuit*`) and Season, draft, auto-draft, scoring and realtime modules, in both directions. Circuit code may import the pure `domain/draftOrder` and `domain/draftPickRules`, which ADR 0005 section 1 says the Circuit draft reuses. `apps/api/tests/unit/architecture/circuitImportBoundary.test.ts` lints deliberate violations to keep the rule honest.
- The rule covers the API only. The web's Circuit admin code lives under `orchestration/admin/circuit`, `features/admin/{screens,ui}/circuit` and `decisions/admin/circuit.ts`, and imports no Season or draft code.
