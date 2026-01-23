# 0002 – Public seasons as auto-managed league containers

## Status

Accepted

## Context

We need ad-hoc, open-join “public seasons” tied to the active ceremony without requiring users to manage leagues. The existing data model requires `season.league_id` and most permissions/auth flows depend on league membership. Adding a parallel “group” entity would be a large schema + permission refactor. We also want to keep public seasons separate from private leagues in UI and listings.

## Decision

- Model a public season as an auto-managed league with a new flag `league.is_public_season = TRUE` (migration 021).
- Each ceremony can have at most one public-season container (partial unique index on `league.ceremony_id` where `is_public_season = TRUE`).
- Public-season leagues are always `is_public = TRUE` but excluded from regular league listings and join flows.
- Public seasons are created on demand for the active ceremony via `/seasons/public`; creation auto-creates:
  - a league (public, flagged `is_public_season`)
  - an EXTANT season for that league
  - an OWNER league_member for the requesting user (no auto season membership)
- Open join happens via `/seasons/public/:id/join`, using season membership, rate-limited, and enforcing `league.max_members`.
- Default caps are env-tunable (`PUBLIC_SEASON_MAX_MEMBERS`, `PUBLIC_SEASON_ROSTER_SIZE`) with sane fallbacks; roster size is clamped to the cap.

## Consequences

- No schema fork for seasons: existing season/season_member logic continues to work; league-based permissions stay intact.
- Regular league lists and public-league discovery filter out `is_public_season`, keeping UI separation.
- Future UI can treat public seasons as a distinct surface while reusing league/season membership enforcement.
- If we ever introduce a dedicated “group” abstraction, we can migrate by relaxing the `season.league_id` constraint and backfilling from the flagged leagues.\*\*\*
