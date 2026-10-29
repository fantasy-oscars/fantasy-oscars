# Auth strategy (API)

## Session model

- Login (`POST /auth/login`) creates a row in `auth_session` (random opaque `id`,
  `user_id`, `created_at`, `last_seen_at`, `expires_at`, `revoked_at`) and returns an
  HS256 JWT whose `sid` claim is that session id.
- The JWT is set as the HttpOnly `auth_token` cookie (SameSite=None + Secure in
  production, Lax in dev) and also returned as `{ user, token }`.
- Every authenticated request (`requireAuth`) and every `/drafts` Socket.IO handshake
  verifies the JWT signature, then loads the user through its session in one query.
  The request is rejected with 401 `UNAUTHORIZED` when the session is missing,
  revoked or expired, when the user is deleted, or when the token has no `sid`
  (tokens issued before sessions existed). The web treats that as a normal
  signed-out state and drops its stored token.
- Lifetime: 30 days, sliding. When a request arrives and the session's
  `last_seen_at` is more than 24 h old, `expires_at` moves to now + 30 days,
  `last_seen_at` is updated and a fresh cookie (new JWT, same `sid`) is set. At most
  one write per session per 24 h. The JWT `exp` always matches the session's
  `expires_at`.
- Absolute cap: no session lives beyond `created_at` + 180 days. Renewal never
  extends `expires_at` past the cap, and the session lookup rejects older
  sessions, so users sign in again at least every 180 days.
- A rejected cookie is cleared (`Set-Cookie: auth_token=; Max-Age=0`) only when the
  cookie was the credential used; a rejected Bearer token leaves the cookie alone.
- Every `/auth/*` response is sent with `Cache-Control: no-store`.
- `GET /auth/me` also returns `token`: a JWT for the same live session with the
  current expiry. The web stores it so the Bearer fallback (below) follows the
  sliding expiry. It is only issued for a live session, so a revoked session never
  gets a token back.

## Revocation

- Logout (`POST /auth/logout`) revokes the session of every valid token presented
  (Bearer header and cookie) and clears the cookie. Other sessions (other devices)
  keep working.
- Account deletion (self via `DELETE /auth/me`, or `DELETE /admin/users/:id`)
  revokes every session of the user. A hard delete of `app_user` cascades.
- Revocation is checked when a request or a socket handshake arrives. A
  `/drafts` socket that is already connected is not disconnected when its session
  is revoked; it keeps receiving draft events until it drops and fails to
  reconnect. Its write actions go through HTTP and are rejected immediately.
- A password reset (`pnpm run admin:reset-password`, see
  [admin.md](admin.md#reset-a-users-password)) revokes every session of the user.

## CSRF guard

`POST /auth/logout` and `DELETE /auth/me` can be driven by the cookie alone, so
they refuse (403 `FORBIDDEN`) a request whose `Origin` header is present and not in
`CORS_ALLOWED_ORIGINS`. Requests without `Origin` (non-browser clients) are allowed.

## Passwords

- New and reset passwords are stored as salted scrypt hashes.
- Legacy unsalted `sha256` rows are still accepted at login; a successful login
  rehashes the password with scrypt in the same request. The rehash and the new
  session are written in one transaction that locks the password row as it was
  verified, so a concurrent admin reset either wins (the login is refused) or
  revokes the session the login created. Remaining legacy rows
  are cleared by the next login or an admin reset; nobody is forced to reset.

## Bearer fallback and the single-site follow-up

The web app and API currently run on different sites, and some browsers (notably
iOS Safari) block the third-party `auth_token` cookie. The web therefore keeps the
token from login (and `/auth/me`) in `localStorage` and sends it as
`Authorization: Bearer <token>`; the API prefers the header over the cookie.

Once web and API share a site (same registrable domain):

- the cookie becomes first-party, so it can move to `SameSite=Lax` (or `Strict`);
- the API can stop returning `token` from `/auth/login` and `/auth/me`, and the web
  can drop `lib/authToken.ts` and the Bearer header, leaving the token readable
  only by the browser's cookie jar (no exposure to page scripts).

Until then the fallback stays; server-side revocation applies to both transports.

## Dev flow

Set `AUTH_SECRET`, register via `POST /auth/register`, log in, then call protected
routes with either the `Authorization` header or the `auth_token` cookie.
