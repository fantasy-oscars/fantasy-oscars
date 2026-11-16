# Series

The Series is a season-long competition across a slate of awards ceremonies, with the Academy Awards as the finale. The domain model and its reasoning are in [ADR 0005](../adr/0005-series-domain-model.md); the build order is in the [plan](../planning/series/plan.md). This page describes what exists today: the foundation (migration `022_series_foundation.sql`). Leagues, drafts, ownership, scoring and waivers come in later packages.

## TL;DR

- A Series has five fixed **events** and eight fixed **canonical categories**, created with it in one transaction.
- Admins **associate** ceremonies with events and **map** each ceremony category to at most one canonical category. Nothing is inferred from names.
- Each ceremony has a **nominations date** and a **results date** (`ceremony.nominations_on`, `ceremony.results_on`). Every associated ceremony gives two **scoring occasions**, one per date.
- **Activation** (`DRAFT → ACTIVE`) never waits for dates. It returns the associated ceremonies that still lack one.
- The Series is independent of the Season: no foreign keys either way, and no imports between Series code and Season, draft, scoring or realtime code.

## Table map

| Table             | What it holds                                                        | Key constraints                                                                                            |
| ----------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `series`          | `code`, `name`, `status` (`DRAFT`, `ACTIVE`, `ARCHIVED`), `opens_on` | `UNIQUE (code)`; `activated_at` is set when `ACTIVE`                                                       |
| `series_event`    | The five events, in display order                                    | `UNIQUE (series_id, code)`; codes `CRITICS_CHOICE`, `GOLDEN_GLOBES`, `GUILDS`, `BAFTA`, `OSCARS`           |
| `series_category` | The eight canonical categories and their `kind`                      | `UNIQUE (series_id, code)`; `kind` is fixed by code (`ACTING` for the four acting categories, else `FILM`) |
| `series_ceremony` | Which ceremony counts as which event                                 | PK `(series_id, ceremony_id)`; the event must belong to the same Series                                    |
| `series_mapping`  | Ceremony category edition → canonical category                       | PK `(series_id, category_edition_id)`, so one edition maps to at most one category                         |

`series_ceremony` is the one shared association. The Series admin and the ceremony admin both read and write it; neither keeps a copy. Removing an association also removes that ceremony's mappings in the Series. A mapping is refused (409 `SERIES_CEREMONY_NOT_ASSOCIATED`) until the edition's ceremony is associated.

The event and category codes live in `apps/api/src/domain/series.ts`, and the migration's check constraints mirror them.

## Dates and scoring occasions

- `nominations_on` and `results_on` are whole days (`date`, sent as `YYYY-MM-DD`). Admins can set them at any ceremony status, archived included. Editing them never changes a Series' status.
- A **scoring occasion** is `(ceremony, kind)` with `kind` `NOMINATION` or `WIN`. It is derived from the ceremony and its dates, never stored (`listScoringOccasions`). Dated occasions sort first, in date order, then undated ones in event order.
- **Ownership instant.** An occasion on day `D` is evaluated against ownership at `D 00:00 America/Los_Angeles`, the instant that day's waiver window opens. Nominations and wins on the same day share one instant. See [ADR 0005, section 3](../adr/0005-series-domain-model.md#3-scoring-occasions-and-dates).
- **Readiness** (`findCeremoniesMissingDates`) lists the associated ceremonies that lack either date. It is informational: activation proceeds regardless, and the Series admin shows the list.

## Structural edits after activation

Owner question 6 is built to the recommended answer. Associations and mappings stay editable while a Series is `ACTIVE`. The admin screens ask for confirmation first, and every audit row records the Series status at the time of the edit. Only an `ARCHIVED` Series is read-only (409 `SERIES_ARCHIVED`).

## Admin

Routes are listed in the [admin runbook](../runbooks/admin.md#series-admin-routes). Every write appends to `admin_audit_log`, with `target_type` `series`, or `ceremony` for date edits.

Screens:

- **Admin → Game Content → Series** (`/admin/series`): the list of Series and a form to create one.
- **Series detail** (`/admin/series/:id`): activation with the missing-dates notice, ceremonies grouped by event (add and remove), category mappings grouped by ceremony, and the schedule of occasions.
- **Ceremony admin, Initialize step** (`/admin/ceremonies/:id/overview`): a **Series dates** form and a **Series** panel that adds or removes this ceremony from a Series. Both work at every ceremony status.

## Public reads

`GET /series`, `/series/:id`, `/series/:id/events`, `/series/:id/categories` and `/series/:id/schedule`. A `DRAFT` Series returns 404 and is left out of the list. Draft and deleted ceremonies are left out of events and the schedule.

## Independence from the Season

- `apps/api/tests/integration/db/seriesSchema.integration.test.ts` queries `information_schema` and fails on any foreign key between a `series_*` table and the Season and ceremony-draft tables. It also proves the check catches one, by adding forbidden keys inside a rolled-back transaction.
- `eslint.config.mjs` blocks imports between API Series modules (`series*`) and Season, draft, auto-draft, scoring and realtime modules, in both directions. Series code may import the pure `domain/draftOrder` and `domain/draftPickRules`, which ADR 0005 section 1 says the Series draft reuses. `apps/api/tests/unit/architecture/seriesImportBoundary.test.ts` lints deliberate violations to keep the rule honest.
- The rule covers the API only. The web's Series admin code lives under `orchestration/admin/series`, `features/admin/{screens,ui}/series` and `decisions/admin/series.ts`, and imports no Season or draft code.
