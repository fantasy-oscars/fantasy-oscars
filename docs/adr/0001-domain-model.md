# 0001 – Canonical Domain Model (Fantasy Oscars)

## Status

Accepted

## Context

We need a single source of truth for core fantasy draft concepts so API/UI/tests don’t drift. Schema exists in `database/migrations/001_init.sql`, and factories mirror it, but there’s no explicit statement of entities, relationships, and invariants.

## Decision

Document and “freeze” the canonical domain model for the Foundations & Guardrails milestone:

## Core entities

- **Ceremony**: yearly event with categories.
- **Category Family / Category Edition**: reusable category template per ceremony; edition points to ceremony/family with unit kind and display templates.
- **Nomination**: one subject per category edition; subject can be film OR song OR performance (exclusive).
- **Nomination Contributor**: people associated with a nomination.
- **App User / Auth Password**: users with credentials (placeholder auth).
- **League**: scoped to a ceremony; has max members, roster size, visibility, owner.
- **Season**: ties a league to a ceremony for a specific cycle; one EXTANT season per (league, ceremony), can be cancelled for history.
- **League Member**: user in league with role (OWNER/CO_OWNER/MEMBER); unique per league.
- **Draft**: one per season; status (PENDING/IN_PROGRESS/COMPLETED/CANCELLED), order type (SNAKE/LINEAR), current pick.
- **Draft Seat**: seat number per draft bound to a league member; unique per draft/seat and draft/member; active flag.
- **Draft Pick**: made by a seat/member in a draft; unique pick number per draft, unique nomination per draft, unique combo of (round, seat) per draft.
- **Catalog**: icon, person, film, song, performance as supporting objects.

## Key invariants

- **Nomination subject exclusivity**: exactly one of film_id, song_id, performance_id is set (enforced via check constraint).
- **Category Edition uniqueness**: one edition per ceremony/family (unique(ceremony_id, family_id)).
- **Season uniqueness**: at most one EXTANT season per (league, ceremony); cancelled seasons remain for history.
- **Draft uniqueness per season**: one draft per season.
- **Draft seat uniqueness**: unique(draft_id, seat_number) and unique(draft_id, league_member_id).
- **Draft pick uniqueness**: unique per draft pick_number, nomination, and (round_number, seat_number).
- **League membership uniqueness**: unique(league_id, user_id).

## Sources of truth

- Schema: `database/migrations/001_init.sql` encodes entities/invariants.
- Test factories: `apps/api/test/factories/*.ts` mirror the schema for fixtures.
- Domain docs: this ADR plus a short summary in architecture docs.

## Usage guidance

- Centralize domain invariants in schema + shared validation helpers (avoid ad-hoc rule copies in endpoints/UI).
- Reuse factories/builders for tests; avoid duplicating entity shapes in web/API.
- Schema changes require ADR updates when they alter core entities or invariants.

## Consequences

- API/UI/tests align on the same model and constraints.
- Future changes to core entities or invariants require a follow-on ADR and schema migration.
- Shared package can reuse these definitions to prevent divergence across apps.
