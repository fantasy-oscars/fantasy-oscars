# ADR 0006: Circuit, with an admin-defined structure

- Status: Accepted
- Date: 2026-11-16
- Supersedes: [ADR 0005](0005-series-domain-model.md) section 1 (reference list and table prefix), section 2 (fixed events and categories) and section 4 (league events)

## Context

ADR 0005 modelled the season-long competition as a "Series" with five fixed events (Critics Choice, Golden Globes, an indivisible Guild bundle, BAFTA, Oscars) and eight canonical categories, all enforced by check constraints and inserted when a Series was created. Migration `022_series_foundation.sql` built that.

The owner corrected three things on 2026-11-16:

1. **Vocabulary.** Players already join a "season". A second competition called "Series" next to it is confusing, so players see "Season" for both, and only code and admin tell them apart.
2. **Ceremonies are not fixed.** Admins choose which ceremonies a competition covers, and how they group into events. The Guild bundle is one ordinary event an admin can build, not a rule.
3. **Categories are not fixed.** Admins build the competition's categories from the existing category templates, and ceremony categories map to them, many-to-one (Golden Globes Best Actor – Drama and Best Actor – Musical or Comedy both map to one Actor category).

## Decision

### 1. Vocabulary

| Concept                                                               | Code and tables                                 | Admin UI         | Player-facing UI |
| --------------------------------------------------------------------- | ----------------------------------------------- | ---------------- | ---------------- |
| The long, multi-ceremony competition                                  | `circuit`, `circuit_*`, `Circuit*`, `/circuits` | Circuit          | **Season**       |
| The single-ceremony competition                                       | `season` (unchanged)                            | Season           | Season           |
| An admin-defined group of one or more ceremonies, enabled as one unit | `circuit_event`                                 | Event            | Event            |
| A competition-level category that ceremony categories map to          | `circuit_category`                              | Circuit category | Category         |

Player-facing copy never says "Circuit": a person joins a season, whether it covers one ceremony or the whole run. Admin copy that needs it explains: "A Circuit is a season-long competition across several ceremonies; players see it as a Season." The rest of ADR 0005 applies to the Circuit under the new names (`series_league` becomes `circuit_league`, and so on).

### 2. Table family and shared reference data (replaces ADR 0005 section 1, first paragraph)

All Circuit state lives in tables prefixed `circuit_`. They may reference shared reference data: `app_user`, `league`, `league_member`, `ceremony`, `category_edition`, `category_family`, `icon`, `nomination`, `nomination_contributor`, `ceremony_winner`, `film` and `person`. The Season and draft exclusions of ADR 0005 section 1 and the independence rules of section 10 are unchanged and keep their tests (the schema test and the ESLint import rule, both renamed).

### 3. Events, categories and mappings (replaces ADR 0005 section 2)

Migration `023_circuit_admin_structure.sql` renames the `series_*` tables, columns, constraints, indexes and sequences to `circuit_*`, keeping every row.

| Table              | Key columns                                                                                                         | Constraints                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `circuit`          | as `series` in ADR 0005                                                                                             | as before                                                                                                                                         |
| `circuit_event`    | `id`, `circuit_id`, `code`, `name`, `sort_index`                                                                    | `UNIQUE (circuit_id, code)`; no fixed code list. The code is admin-entered or generated from the name                                             |
| `circuit_category` | `id`, `circuit_id`, `code`, `name`, `kind`, `sort_index`, `category_family_id NULL`, `icon_id NULL`, `icon_variant` | `UNIQUE (circuit_id, code)`; `kind IN ('FILM','ACTING')`; `category_family_id` references `category_family` `ON DELETE SET NULL`                  |
| `circuit_ceremony` | `circuit_id`, `ceremony_id`, `circuit_event_id`                                                                     | PK `(circuit_id, ceremony_id)`; the event belongs to the same Circuit                                                                             |
| `circuit_mapping`  | `circuit_id`, `category_edition_id`, `circuit_category_id`                                                          | PK `(circuit_id, category_edition_id)`: a ceremony category maps to at most one Circuit category; any number may map to the same Circuit category |

- **A new Circuit is empty.** Creating one inserts no events and no categories. The former five events and eight categories are a default slate an admin can build, not a rule.
- **Any ceremony can be added.** Every associated ceremony belongs to exactly one event of its Circuit. Adding a ceremony without choosing an event creates a one-ceremony event named after it. Admins create, rename, reorder and delete events, and move ceremonies between them. An event left with no ceremonies is deleted in the same transaction. Deleting an event ungroups it: each of its ceremonies moves to its own one-ceremony event and keeps its mappings.
- **Categories come from templates (copy-on-add).** Adding a Circuit category copies the template's name, icon and code; later template edits never change the Circuit. Kind comes from the template's `default_unit_kind`: `FILM` gives `FILM`, `PERFORMANCE` gives `ACTING`. `SONG` templates are rejected, because selection identity (ADR 0005 section 5) has no song. Admins rename, reorder and remove categories; removing one removes its mappings.
- **Mappings are explicit rows.** When a ceremony category's template matches exactly one Circuit category's template, the mapping screen pre-selects it. Nothing is saved until the admin saves, and nothing is inferred from names.
- Readiness and the scoring-occasion schedule are pure functions over whatever ceremonies are associated.
- Structural edits after activation stay allowed for admins and are audit-logged; an archived Circuit is read-only. Every write appends to `admin_audit_log`.
- Existing data migrates as is: events keep their codes without the check, categories keep their rows and get `category_family_id` (and the template's icon) where a template's code matches theirs case-insensitively, otherwise null.

### 4. League events (replaces the event rows of ADR 0005 section 4)

`circuit_league_event` keys on `circuit_event_id`, as before, so a league enables and weights whole events. At league creation it gets one row per event the Circuit has, whatever their number, instead of "all five". Grouping ceremonies into events is how an admin makes a set of ceremonies indivisible for leagues (the former Guild bundle).

### 5. Scoring with many-to-one mappings

Matching (ADR 0005 section 5) is unchanged in form. With several categories of one ceremony mapped to one Circuit category:

- a selection still scores **at most once per occasion** `(ceremony, kind)`, even when several mapped categories of that ceremony nominate it;
- each mapped category's winner is a separate win match, so two different winners of one ceremony that map to the same Circuit category (Best Actor – Drama and Best Actor – Musical or Comedy) each score their own win.

## Alternatives Considered

- **Keep the fixed slate and add an "other" event.** Smallest change. Rejected: the owner wants any ceremony, and the bundle rule would still be hard-coded.
- **Let a ceremony belong to a Circuit without an event.** Simpler association. Rejected: leagues enable and weight events (section 4), so an event-less ceremony would need a second configuration key. A one-ceremony event keeps one key.
- **Free-text Circuit categories.** Rejected: templates already carry the name, icon and unit kind ceremonies use, and a shared template is what makes the mapping suggestion possible.
- **Reference the template instead of copying it.** Rejected for the same reason ceremonies copy: templates can be edited or deleted, and a running competition must not change underneath its leagues.
- **Name the competition "Season" in code too.** Rejected: `season` is the single-ceremony table family; one word for two tables would make the independence rules unreadable.

## Consequences

- Positive: the competition covers whatever ceremonies the owner picks, and categories match the templates ceremonies already use.
- Positive: one association, one league configuration key (the event), and explicit mappings, as before.
- Negative: an admin has to build each Circuit's structure; there is no one-click default slate.
- Negative: code and players use different words for the same thing; the vocabulary table above is the reference.
- Follow-ups: the admin screens (Ceremonies and Categories sections, many-to-one mapping view) and the docs rename follow in the same package. Later packages use the Circuit names and follow the player-facing "Season" rule.
