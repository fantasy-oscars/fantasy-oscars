# Public Seasons Policy (Post-MVP)

## Purpose

- Provide a quick-join experience for the active ceremony without user-managed leagues.

## Model

- Backed by leagues flagged `is_public_season = TRUE`; one container per ceremony.
- Season is created as EXTANT for the active ceremony; roster size <= max_members.
- Excluded from regular league listings and public-league discovery.

## Join flow

- Auth required; joins add `league_member` (if missing) and `season_member`.
- Rate limit: 8 join attempts / 5 minutes per IP.
- Cap: enforce `league.max_members`; returns `PUBLIC_SEASON_FULL` when full.

## Discovery

- `/seasons/public` returns/creates the active ceremony’s public season.
- Not visible in `/leagues` or `/leagues/public`.

## Defaults

- Env overrides: `PUBLIC_SEASON_MAX_MEMBERS`, `PUBLIC_SEASON_ROSTER_SIZE`.
- Fallbacks: max_members=200, roster_size=10, roster_size clamped to max.
