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

## Reset a User's Password

There is no self-service reset. An operator with database access sets a new
password and signs the user out everywhere:

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

### Series admin routes

See [architecture/series.md](../architecture/series.md). Every write appends to
`admin_audit_log`. Associations and mappings stay editable after activation;
only an archived Series is read-only (409 `SERIES_ARCHIVED`).

- `GET /admin/series`: list every Series.
- `POST /admin/series` with `{ code, name, opens_on? }`: create a Series with its
  five events and eight categories.
- `GET /admin/series/:id`: events, categories, associated ceremonies with their
  dates, category editions with their mapping, `readiness.missing_dates` and
  `occasions`.
- `POST /admin/series/:id/activate`: `DRAFT → ACTIVE`. Always succeeds from
  `DRAFT` and returns `readiness.missing_dates`; otherwise 409 `SERIES_NOT_DRAFT`.
- `PUT /admin/series/:id/ceremonies/:ceremonyId` with `{ series_event_id }`, and
  `DELETE` on the same path: associate or remove a ceremony (removal also drops
  its mappings in the Series).
- `GET /admin/ceremonies/:id/series`: the ceremony's associations, plus every
  non-archived Series with its events.
- `PUT /admin/ceremonies/:id/series/:seriesId` with `{ series_event_id }`, and
  `DELETE` on the same path: the same association, from the ceremony side.
- `PUT /admin/series/:id/mappings/:categoryEditionId` with
  `{ series_category_id }`, and `DELETE` on the same path: map or unmap a
  category edition. 409 `SERIES_CEREMONY_NOT_ASSOCIATED` until its ceremony is
  in the Series.
- `PATCH /admin/ceremonies/:id/dates` with `{ nominations_on?, results_on? }`
  (`YYYY-MM-DD`, `null` clears): works at every ceremony status and never
  changes a Series' status.

## Notes

- Default is non-admin on registration.
- If a token was issued before promotion, re-authenticate to refresh claims.
