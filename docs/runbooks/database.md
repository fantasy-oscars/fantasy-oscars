# Runbook: Database

## TL;DR

- Tests use Testcontainers Postgres; migrations auto-apply from `database/migrations`.
- Reset between test suites via truncate + identity restart.
- Local DB is provided via docker-compose and uses the same migrations.
- This repo currently uses a squashed baseline migration (`database/migrations/001_init.sql`). If that baseline changes (pre-launch), reset local/Render DBs to stay in sync.

## Migrations

- Add: create `database/migrations/NNN_description.sql`
- Applied automatically in integration tests.
- Ordering rule: filenames use zero-padded numeric prefixes and must be strictly increasing (no duplicate numbers). Tooling sorts by numeric prefix and fails fast on duplicates.
- Validate ordering locally/CI: `pnpm run test:migrations` (also runs inside `pnpm run ci`).

## Test DB

- Powered by Testcontainers; requires Docker.
- Migrations apply on container startup.
- Cleanup: truncate all public tables and restart identities between suites.

## Local DB

- Start/stop Postgres: `pnpm run db:up` / `pnpm run db:down`.
- Only the DB is containerized (by design). Run `apps/api` / `apps/web` on the host for faster iteration and better debugging.
- Connect with: `DATABASE_URL=postgres://fantasy:fantasy@localhost:5433/fantasy_oscars`
- Apply migrations: `DATABASE_URL=postgres://fantasy:fantasy@localhost:5433/fantasy_oscars pnpm run db:migrate`

## Troubleshooting

- Testcontainers cannot start: ensure Docker daemon is running and your user can access the socket.
- Migration errors: verify SQL in `database/migrations`; ensure order is correct.
  - If your DB predates `migration_history` and you need a one-time bootstrap, run `pnpm run db:migrate -- --bootstrap-existing` (unsafe; prefer resetting the DB when possible).

## Production

- **Host:** Render Managed Postgres (see [deployment runbook](deployment.md) for service URLs and secrets).
- **DB/user:** Create a dedicated database and least-privilege user; store the resulting `DATABASE_URL` in the Render API service env vars.
- **Backups:** Use Render’s managed backups (default schedule); no PITR in MVP. Document upgrades/restores in provider console.
- **Connect:** From a trusted machine or Render shell:

  ```bash
  psql "$DATABASE_URL"
  ```

- **Migrations (prod):**

  ```bash
  DATABASE_URL=$DATABASE_URL pnpm run db:migrate
  ```

  The script records applied files in `migration_history` and applies new `database/migrations/*.sql` in order.
- **Verification after provisioning:**
  - `psql "$DATABASE_URL" -c "\dt"` shows core tables (`app_user`, `league`, `ceremony`, etc.).
  - `psql "$DATABASE_URL" -c "SELECT count(*) FROM migration_history;"` confirms migrations ran.
  - From API shell: `psql "$DATABASE_URL" -c "SELECT 1;"` to confirm connectivity.

## Production on the VPS

After the cutover from Render the database is the `db` service (postgres 18, no published ports) in the compose project `fantasy-oscars` on the VPS. Backups, restores and the migration of data from Render are covered in [vps.md](vps.md):

- Encrypted `pg_dump -Fc` backups go offsite nightly (hourly during awards season) and before every deploy; restore with `infra/restore.sh`.
- Open a SQL shell on the server: `docker compose -p fantasy-oscars exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`.
- The "Production" section above describes the previous Render setup and applies only until the cutover is complete.

## Links

- Testing standard: [../standards/testing.md](../standards/testing.md)
- Data architecture: [../architecture/data.md](../architecture/data.md)
- Deployment topology and secrets: [deployment.md](deployment.md)
