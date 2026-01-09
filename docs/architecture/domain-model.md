# Canonical Domain Model

## TL;DR

- Core entities: ceremony, category family/edition, nomination (+ contributors), app user/auth, league, league member, draft, draft seat, draft pick, and supporting catalog (icon, display templates, film/song/performance, person).
- Invariants: nomination has exactly one subject (film OR song OR performance); unique category edition per ceremony/family; one draft per league; unique draft seats per draft/seat and draft/member; draft picks unique per draft pick_number, per draft nomination, and per (round, seat); league membership unique per league/user.
- Sources of truth: schema `db/migrations/001_init.sql`, test factories (`apps/api/test/factories`), and ADR [0001-domain-model.md](../adr/0001-domain-model.md).

## Entities and Relationships

- **Ceremony**: yearly event; owns category editions.
- **Category Family / Category Edition**: reusable template; edition ties a family to a ceremony with unit_kind, display templates, optional icon.
- **Nomination**: belongs to a category edition; subject is exactly one of film, song, performance (exclusive).
- **Nomination Contributor**: people linked to a nomination (roles, order).
- **Catalog**: icon, display_template, person, film, song, performance.
- **App User / Auth Password**: users and credential placeholder.
- **League**: scoped to a ceremony; owner, roster/max members, visibility.
- **League Member**: user in league with role; unique per league/user.
- **Draft**: single per league; status/order type/current pick; monotonic version for authoritative mutations.
- **Draft Seat**: seat binding to league_member; unique per draft seat_number and draft/member.
- **Draft Pick**: pick made by a seat/member; unique pick_number per draft, unique nomination per draft, unique (round_number, seat_number) per draft.
- **Draft Event**: immutable stream of draft mutations (versioned per draft).

## Invariants (selected)

- Nomination subject exclusivity: exactly one of film_id/song_id/performance_id (check constraint).
- Category Edition uniqueness: one per ceremony/family.
- Draft uniqueness: one draft per league.
- Draft seat uniqueness: per draft seat_number and per draft league_member.
- Draft pick uniqueness: per draft pick_number, per draft nomination, per (round_number, seat_number).
- Draft versioning: each authoritative mutation increments draft.version and inserts a draft_event with the same version.
- League membership uniqueness: per league/user.

## Usage Guidance

- Centralize rules in schema and shared helpers; avoid ad-hoc UI/API logic that drifts.
- Use factories (`apps/api/test/factories`) to mirror the canonical shapes in tests.
- Schema changes that alter these entities/invariants require ADR updates.

## Links

- ADR: [0001-domain-model.md](../adr/0001-domain-model.md)
- Schema: [db/migrations/001_init.sql](../../db/migrations/001_init.sql)
- Factories: [apps/api/test/factories](../../apps/api/test/factories)
