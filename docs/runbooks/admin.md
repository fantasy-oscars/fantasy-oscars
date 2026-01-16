# Runbook: Admin Users

## TL;DR

- Admins are marked with `app_user.is_admin = true`.
- Tokens carry `is_admin`; `requireAdmin` middleware gates admin routes.
- Promote a user locally by updating the flag, then log in to get a fresh token.

## Promote an Admin (local/dev)

```sql
UPDATE app_user SET is_admin = TRUE WHERE handle = 'your-handle';
```

Then log in again so the issued token includes `is_admin: true`.

## Admin Routes

- Protected by `requireAuth` + `requireAdmin`.
- Example: `POST /admin/ceremonies/:id/name` updates a ceremony name.

## Notes

- Default is non-admin on registration.
- If a token was issued before promotion, re-authenticate to refresh claims.
