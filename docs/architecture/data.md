# Data & Migrations

## TL;DR

- Postgres is the system of record.
- Migrations live in `database/migrations` and are ordered by a zero-padded numeric prefix (strictly increasing, no duplicates).
- Tests apply migrations automatically via Testcontainers.
- Auth data: `app_user.username` and `app_user.email` are stored as-entered; unique indexes on `lower(...)` enforce case-insensitive uniqueness.
- Admin role: `app_user.is_admin` (boolean) flags admins; tokens carry `is_admin` and admin routes require it.
- Ceremonies: `ceremony` is a long-lived object (status transitions Draft → Published → Locked → Complete → Archived).
- App config: `app_config.active_ceremony_id` may be used as a default/legacy pointer in some flows; it is not a hard global restriction on ceremonies.
- Seasons: `season` links a league to a ceremony; drafts belong to a season (one draft per season). (League membership is derived from season participation.)
- Draft start freezes sizing: `draft.picks_per_seat = floor(draft-eligible nominations for the ceremony / participant count)` is computed at `POST /drafts/:id/start`, stored on the draft, and used for completion; any remainder nominations stay undrafted for MVP.
- Draft status can be paused by commissioners; `status=PAUSED` blocks picks, surfaces in snapshots, and is reversible via resume.
- Draft actions (start/pick) are blocked when the season is cancelled, or when the ceremony is locked for results entry.
- League membership: invite-only per season for MVP; the legacy `POST /leagues/:id/join` endpoint is disabled and returns `INVITE_ONLY_MEMBERSHIP`.
- League creation: creates the league and OWNER membership; seasons are created explicitly.
- Ceremony winners: `ceremony_winner` stores winning `nomination_id` per category edition (unique). `ceremony.draft_locked_at` records when results entry begins.
- Standings/results source of truth: draft standings pull winners from `ceremony_winner` for the draft’s ceremony (shared across drafts); the legacy `draft_result` table is not used for scoring.
- Season membership & invites: `season_member` tracks users per season (unique per season/user, roles OWNER/CO_OWNER/MEMBER); `season_invite` supports placeholder (token-hash, single-use) and user-targeted invites with lifecycle statuses (PENDING/CLAIMED/REVOKED/DECLINED). Pending user-targeted invites are unique per (season, intended_user). Placeholder tokens store SHA-256 hex digests; no expiry in MVP.
- User-targeted invites are commissioner-created, surface only in an authenticated inbox for the intended user, and accept/decline is only allowed while drafts for the ceremony have not started; accepting atomically adds league + season membership.

## Principles

- Schema changes land via migrations; never manual drift.
- Keep migrations idempotent and reversible when possible.
- Test data is isolated per run; truncate and restart identities between tests.

## Environments

- **Local / Tests:** Testcontainers Postgres, migrations auto-applied.
- **Future prod/stage:** To be defined via ADR (will follow the same migration mechanism).

## Operations

- Add migration: create `database/migrations/NNN_description.sql` with the next unused numeric prefix.
- Validate ordering: `pnpm run test:migrations` (part of `pnpm run ci`).
- Apply in tests: automatic (see `apps/api/test/db.ts`).
- Local DB (docker-compose): `pnpm run db:up` / `pnpm run db:down`.

## Links

- Architecture overview: [overview.md](overview.md)
- Test strategy: [../standards/testing.md](../standards/testing.md)
