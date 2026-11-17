# ADR 0007: Circuit groups, a derived results date and shared waiver windows

- Status: Accepted
- Date: 2026-11-16
- Amends: [ADR 0006](0006-circuit-admin-defined-structure.md) section 3 (events), and [ADR 0005](0005-series-domain-model.md) section 3 (dates) and section 9 (windows)

## Context

ADR 0006 gives every associated ceremony an event, creating a one-ceremony event when an admin adds a ceremony without choosing one. Leagues key their configuration on events, so that stays. But the admin screens cannot tell an admin-made group (Guild Awards) from the plumbing event of a single ceremony, and the five events of the old fixed slate (migration 022) survive with no ceremonies in them. Admins read the empty ones as ceremony templates.

ADR 0005 added `ceremony.results_on`, a whole day entered apart from the ceremony datetime `starts_at`. In production the two had drifted: some ceremonies had a results date but no datetime, and one had a results date that was not its datetime's date.

The Circuit editor's Schedule tab shows the add/drop windows a Circuit would have, and package `series-08-waivers` needs the same rule for real leagues. Deriving it twice invites two answers.

## Decision

### 1. Groups versus single ceremonies (amends ADR 0006 section 3)

- `circuit_event.is_group boolean NOT NULL DEFAULT false`.
- **A group** is made by an admin (Add group) and named by them; players see that name. A group may be empty, and it is never deleted for being empty.
- **Any other event** belongs to exactly one ceremony. It is created when the ceremony joins the Circuit, or leaves a group, and deleted in the same transaction when the ceremony moves into a group or leaves the Circuit. The admin screens show it as a plain ceremony row.
- A ceremony can move into a group, never into another ceremony's own event.
- `circuit_event.sort_index` orders the top level, groups and single ceremonies together. `circuit_ceremony.sort_index` orders the ceremonies inside an event.
- One write places a ceremony, the drop of a drag: `PUT /admin/circuits/:id/ceremonies/:ceremonyId/position` with `{ group_id, index }`. With a group the ceremony moves into it at `index`; without one it goes to the top level at `index`, getting its own event if it left a group. `PUT /admin/circuits/:id/events/:eventId/ceremonies/order` reorders inside a group, and `PUT /admin/circuits/:id/events/order` reorders the top level. Every write appends to `admin_audit_log`.
- Migration `025_circuit_groups_and_derived_results_date.sql` deletes non-group events without ceremonies (the legacy empty events), marks events holding two or more ceremonies as groups, closes the gaps in `sort_index`, and orders existing ceremonies inside each event by id. Categories and mappings are kept: the legacy categories become ordinary categories.

### 2. The results date is derived (amends ADR 0005 section 3)

- A ceremony's results date is the date of `starts_at` in America/Los_Angeles (`resultsDateOf` in `apps/api/src/domain/circuit.ts`). Readiness, scoring occasions and the schedule use it; the admin enters only the nominations date and the ceremony datetime.
- Migration 025 first sets `starts_at` to 17:00 America/Los_Angeles on `results_on` for ceremonies that had a results date and no datetime, then drops `results_on`. Where the two disagreed, `starts_at` wins. The migration logs each affected ceremony.
- Responses keep a read-only `results_on` field, derived, so readers need not repeat the rule.

### 3. One waiver window function (amends ADR 0005 section 9)

`waiverWindows` in `apps/api/src/domain/waiverWindows.ts` is the pure function section 9 describes. It takes scoring days and returns windows with their first and last covered day, resolution day and the scoring days that opened or extended them. Where section 9 left a choice, it decides:

- consecutive scoring days form a block first, and a block that starts inside an open window extends it to the later of the two ends, so windows never overlap;
- the final scoring day opens and extends no window.

The Circuit admin detail returns `waiver_windows` computed from every associated ceremony's occasions, as if every ceremony were enabled. `series-08-waivers` calls the same function with a league's enabled occasions.

## Alternatives Considered

- **Drop events for single ceremonies.** Simpler screens. Rejected for the reason ADR 0006 gives: league configuration would need a second key.
- **Infer a group from its size.** No column. Rejected: an admin-made group with one ceremony, or none, would be indistinguishable from a single, and would vanish when emptied.
- **Keep `results_on` and validate it against `starts_at`.** Rejected: two inputs for one fact is what drifted.
- **Derive windows in the web for the Schedule tab.** Rejected: the waiver processor needs the rule server-side, and one implementation keeps the preview and the real windows equal.

## Consequences

- Positive: the editor can show groups as containers and singles as rows, and legacy empty events no longer look like templates.
- Positive: one source for the results date, and one for the windows.
- Negative: a ceremony's results date now moves with its datetime: moving the datetime across midnight Pacific moves the results date a day. The schedule shows the derived date.
- Follow-ups: the Circuit editor's tabs, drag and drop and Schedule timeline use these APIs (same package). `series-08-waivers` reuses `waiverWindows`.
