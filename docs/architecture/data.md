# Data & Migrations

## TL;DR

- Postgres is the system of record.
- Migrations live in `db/migrations` and are ordered by a zero-padded numeric prefix (strictly increasing, no duplicates).
- Tests apply migrations automatically via Testcontainers.
- Auth data: `app_user.handle` and `app_user.email` are stored lowercase; unique indexes on `lower(...)` enforce case-insensitive uniqueness.
- Admin role: `app_user.is_admin` (boolean) flags admins; tokens carry `is_admin` and admin routes require it.
- Active ceremony: `app_config.active_ceremony_id` stores the single active ceremony; participatory actions (league/draft flow) are restricted to this ceremony.
- Seasons: `season` links a league to a ceremony; at most one EXTANT season per (league, ceremony); drafts belong to a season (one draft per season).
- Draft start freezes sizing: `draft.picks_per_seat = floor(draft-eligible nominations for the ceremony / participant count)` is computed at `POST /drafts/:id/start`, stored on the draft, and used for completion; any remainder nominations stay undrafted for MVP.
- Draft status can be paused by commissioners; `status=PAUSED` blocks picks, surfaces in snapshots, and is reversible via resume.
- Draft actions (start/pick) are only allowed for the active ceremony while the ceremony is unlocked and the season is EXTANT; once `ceremony.draft_locked_at` is set (winners entered) or the season is CANCELLED, start/picks are blocked.
- League membership: invite-only per season for MVP; the legacy `POST /leagues/:id/join` endpoint is disabled and returns `INVITE_ONLY_MEMBERSHIP`.
- League creation: creating a league automatically creates the initial EXTANT season for the active ceremony and adds the creator as OWNER/member in the same transaction.
- Additional seasons: commissioners can add a new EXTANT season for the active ceremony (one per ceremony). Season lists include an `is_active_ceremony` marker; season creation is blocked if no active ceremony or an extant season already exists for that ceremony.
- Ceremony winners: `ceremony_winner` stores the winning `nomination_id` per `category_edition` (unique). `ceremony.draft_locked_at` records when winners entry begins; it is set once and never unlocked in MVP.
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

- Add migration: create `db/migrations/NNN_description.sql` with the next unused numeric prefix.
- Validate ordering: `npm run test:migrations` (part of `npm run ci`).
- Apply in tests: automatic (see `apps/api/test/db.ts`).
- Local DB (docker-compose): `npm run db:up` / `npm run db:down`.

## Links

- Architecture overview: [overview.md](overview.md)
- Test strategy: [../standards/testing.md](../standards/testing.md)
