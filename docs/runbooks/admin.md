# Runbook: Admin Users

## TL;DR

- Admins are marked with `app_user.is_admin = true`.
- Tokens carry `is_admin`; `requireAdmin` middleware gates admin routes.
- Promote a user locally by updating the flag, then log in to get a fresh token.
- Active ceremony is stored in `app_config.active_ceremony_id`; set it via admin route.

## Promote an Admin (local/dev)

```sql
UPDATE app_user SET is_admin = TRUE WHERE username = 'your-username';
```

Then log in again so the issued token includes `is_admin: true`.

## Help a Player Who Lost Access

Players reset their own password by email ("Forgot password?" on the sign-in
screen; flow in [auth.md](auth.md#password-reset-by-email)). When one asks for help:

1. **Find the account.** Admin → Users: search by username or email. Each result
   shows the email under the username.
2. **They still control that address:** ask them to use "Forgot password?" and to
   check their spam folder. Links expire after an hour and only the newest one
   works. Requests are limited to 3 per hour per address, so if they asked several
   times, wait an hour.
3. **They no longer control it, or the address is wrong** (there is no email
   confirmation, so a typo at signup is possible): verify their identity out of band
   first, for example through someone in their league who knows them, or details only
   the account holder would know (leagues, recent picks). Never act on an email
   alone. Then either:
   - set a new password with `admin:reset-password` (below) and share it privately;
     they can then change their email from the account page; or
   - correct `app_user.email` directly (keep it unique, case-insensitively) and let
     them use "Forgot password?":

     ```sql
     UPDATE app_user SET email = lower('new@example.com') WHERE username = 'alice';
     ```

Do not send a reset link to an address the player does not control.

## Reset a User's Password

An operator with database access sets a new password and signs the user out
everywhere:

```bash
# Password from an env var (prefix the line with a space if your shell keeps
# history for such lines, or use the stdin form below):
RESET_PASSWORD='new-password' pnpm run admin:reset-password -- --username alice

# Or from stdin, e.g. read without echo:
read -rs NEWPW && printf '%s' "$NEWPW" | pnpm run admin:reset-password -- --username alice
```

- `DATABASE_URL` must point at the target database (env, `.env`, or `--url`).
- The password is never accepted as a command-line argument (`--password` is
  refused) so it stays out of shell history and process listings.
- The script stores a scrypt hash, revokes all of the user's sessions and prints
  `{ ok, user, sessions_revoked }`. Share the new password with the user over a
  private channel; they can log in immediately.
- The same command clears any remaining legacy `sha256` password row.

## Admin Routes

- Protected by `requireAuth` + `requireAdmin`.
- Example: `POST /admin/ceremonies/:id/name` updates a ceremony name.
- Set active ceremony: `POST /admin/ceremony/active` with `{ "ceremony_id": <id> }`.
- Read active ceremony: `GET /ceremony/active` (public).

### Circuit admin routes

See [architecture/circuit.md](../architecture/circuit.md). Every write appends to
`admin_audit_log` (`target_type` `circuit`, or `ceremony` for dates). Structural
edits stay allowed after activation; only an archived Circuit is read-only
(409 `CIRCUIT_ARCHIVED`).

- `GET /admin/circuits`: list every Circuit.
- `POST /admin/circuits` with `{ code, name, opens_on? }`: create an empty Circuit
  (no events, no categories).
- `GET /admin/circuits/:id`: events, categories, associated ceremonies with their
  dates, category editions with their mapping and
  `suggested_circuit_category_id` (computed from matching templates, never
  saved), `readiness.missing_dates` and `occasions`.
- `POST /admin/circuits/:id/activate`: `DRAFT → ACTIVE`. Always succeeds from
  `DRAFT` and returns `readiness.missing_dates`; otherwise 409 `CIRCUIT_NOT_DRAFT`.
- `PUT /admin/circuits/:id/ceremonies/:ceremonyId` with `{ circuit_event_id? }`,
  and `DELETE` on the same path: add any ceremony or move it to another event;
  without an event (omitted or `null`) it gets its own one-ceremony event. An
  event left empty is deleted. Removal also drops its mappings in the Circuit.
- `GET /admin/ceremonies/:id/circuits`: the ceremony's associations, plus every
  non-archived Circuit with its events.
- `PUT /admin/ceremonies/:id/circuits/:circuitId` with `{ circuit_event_id? }`,
  and `DELETE` on the same path: the same association, from the ceremony side.
- `POST /admin/circuits/:id/events` with `{ name, code?, ceremony_ids? }`: create
  an event, moving the listed ceremonies into it.
  `PATCH /admin/circuits/:id/events/:eventId` with `{ name?, code? }`: rename.
  `PUT /admin/circuits/:id/events/order` with `{ event_ids }`: reorder (every
  event once). `DELETE /admin/circuits/:id/events/:eventId`: ungroup; each of its
  ceremonies gets its own event and keeps its mappings.
- `POST /admin/circuits/:id/categories` with `{ category_family_id }`: add a
  category copied from a template (`FILM` → `FILM`, `PERFORMANCE` → `ACTING`;
  `SONG` → 400). `PATCH .../categories/:categoryId` with `{ name }`,
  `PUT .../categories/order` with `{ category_ids }`, and
  `DELETE .../categories/:categoryId` (also removes its mappings).
- `PUT /admin/circuits/:id/mappings/:categoryEditionId` with
  `{ circuit_category_id }`, and `DELETE` on the same path: map or unmap a
  category edition. Several editions may map to one Circuit category. 409
  `CIRCUIT_CEREMONY_NOT_ASSOCIATED` until its ceremony is in the Circuit.
- `PATCH /admin/ceremonies/:id/dates` with `{ nominations_on?, results_on? }`
  (`YYYY-MM-DD`, `null` clears): works at every ceremony status and never
  changes a Circuit's status.

## Notes

- Default is non-admin on registration.
- If a token was issued before promotion, re-authenticate to refresh claims.
