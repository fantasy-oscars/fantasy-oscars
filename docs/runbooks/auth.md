# Auth strategy (API)

## Session model

- Login (`POST /auth/login`) creates a row in `auth_session` (random opaque `id`,
  `user_id`, `created_at`, `last_seen_at`, `expires_at`, `revoked_at`) and returns an
  HS256 JWT whose `sid` claim is that session id.
- The JWT is set as the HttpOnly `auth_token` cookie (SameSite=None + Secure in
  production unless `AUTH_COOKIE_SAMESITE` says otherwise, Lax in dev). The response
  body is `{ user }` only: the token is never returned in JSON, so page scripts
  cannot read it.
- Every authenticated request (`requireAuth`) and every Socket.IO handshake
  (`/drafts` and `/circuits`, through `auth/socketSession.ts`) verifies the JWT
  signature, then loads the user through its session in one query. The request
  is rejected with 401 `UNAUTHORIZED` when the session is missing, revoked or
  expired, when the user is deleted, or when the token has no `sid`
  (tokens issued before sessions existed). The web treats that as a normal
  signed-out state.
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
- A password reset, by email link (below) or by an operator
  (`pnpm run admin:reset-password`, see [admin.md](admin.md#reset-a-users-password)),
  revokes every session of the user, including the browser it was completed in.
- A password change from the account page (`POST /auth/password`) keeps the
  current session and revokes every other one.

## CSRF guard

Overall posture: the cookie is `SameSite=Lax` in production, so browsers do not send it
on cross-site `POST`/`PUT`/`PATCH`/`DELETE`; no `GET` route changes state; JSON bodies
need a CORS preflight, which only `CORS_ALLOWED_ORIGINS` passes; and the routes
that a cookie alone can drive also check `Origin` (below). Login CSRF and other hosts on
the same site (`*.fantasy-oscars.com`) are out of scope.

`POST /auth/logout`, `DELETE /auth/me`, `POST /auth/password` and `PATCH /auth/email`
can be driven by the cookie alone, so they refuse (403 `FORBIDDEN`) a request whose `Origin` header is present and not in
`CORS_ALLOWED_ORIGINS`. Requests without `Origin` (non-browser clients) are allowed.

## Passwords

- New and reset passwords are stored as salted scrypt hashes.
- Legacy unsalted `sha256` rows are still accepted at login; a successful login
  rehashes the password with scrypt in the same request. The rehash and the new
  session are written in one transaction that locks the password row as it was
  verified, so a concurrent admin reset either wins (the login is refused) or
  revokes the session the login created. Remaining legacy rows
  are cleared by the next login or an admin reset; nobody is forced to reset.

## Password reset by email

The only email the app sends. Delivery setup: [email.md](email.md).

1. **Request.** "Forgot password?" on the sign-in screen opens `/forgot-password`,
   which posts `POST /auth/password-reset/request { email }`. The answer is always
   `200 {"ok":true}`, whether or not an account uses the address, and the screen
   shows the same message either way, so the form cannot be used to find accounts.
   The lookup and token work happen before the reply; the email is sent after it,
   so known and unknown addresses take about the same time.
2. **Token.** 32 random bytes, base64url, sent only in the email link
   (`$WEB_BASE_URL/reset-password?token=…`). The database keeps only its SHA-256 in
   `password_reset_token` (`token_hash` unique, `expires_at` = created + 60 minutes,
   `used_at`). A new request deletes the user's earlier unused tokens, so only the
   newest link works.
3. **Reset.** `/reset-password` reads the token, removes it from the address bar at
   once (`history.replaceState`) and sets `<meta name="referrer" content="no-referrer">`
   (the site-wide policy is already `strict-origin-when-cross-origin`). It posts
   `POST /auth/password-reset/confirm { token, password }`; the password goes through
   the shared validator. In one transaction the API sets the password, marks the
   token used and revokes every session of the user. It answers `204` and does not
   sign the user in; the web sends them to sign in. A missing, wrong, expired or
   used token gets one answer, `400 INVALID_RESET_TOKEN`, and the page offers a link
   to ask for a new one.

Rate limits (in-memory, per API process): request 10 per 15 minutes per IP and 3 per
hour per address (across IPs); confirm 10 per 15 minutes per IP. A rate-limited
request gets `429` whether or not the address has an account.

A password change, an email change or a completed reset also voids any outstanding
reset links.

## Account changes (signed in)

- `POST /auth/password { currentPassword, newPassword }` → `204`. Wrong current
  password → `400 INVALID_CURRENT_PASSWORD`. Keeps this session, revokes the others.
- `PATCH /auth/email { currentPassword, email }` → `200 { user: { email } }`. An
  address another account uses, in any case, → `409 USER_EXISTS`. No confirmation
  email is sent (owner decision: as few emails as possible), so a typo means the
  user cannot receive reset links until they or an operator fix it.
- Both are Origin-guarded and limited to 10 per 15 minutes per IP, which slows
  guessing the current password with a stolen session.

## Logging

Recovery and account-change routes log structurally only: `password_reset_requested`
(outcome `issued` or `no_account`), `password_reset_completed`, `password_changed` and
`email_changed`, each with `user_id` and outcome. Tokens, passwords and full email
addresses are never logged. These are player actions, so nothing goes to
`admin_audit_log`. In development the logging mailer writes `mail_logged` with a
masked recipient (`a***@example.com`) and the link, so the flow can be tested
without sending email.

## Credential transports

- **Browser (the web app):** the HttpOnly `auth_token` cookie only, over HTTP and on
  the `/drafts` and `/circuits` Socket.IO handshakes (browsers send cookies on the
  same-origin websocket upgrade). The web keeps nothing in `localStorage` and sends no
  `Authorization` header; on load it deletes the `fo_auth_token` key left by older
  builds. This needs a first-party cookie, i.e. same-origin hosting (see
  [deployment.md](deployment.md#hosting-modes)).
- **Non-browser clients (scripts, tests, e2e seeding):** `Authorization: Bearer
<token>` is still accepted on HTTP and on the socket handshake and wins over the
  cookie. Take the token from the `Set-Cookie: auth_token=...` header of
  `POST /auth/login`; it is no longer in the body.
- **Transition only:** the socket handshake also accepts the token in the Socket.IO
  `auth` payload (`auth.token` or `auth.Authorization`). Tabs opened before the
  cookie-only change send it, and they keep working through the
  `api.fantasy-oscars.com` alias. Remove it with the alias.

Server-side revocation applies to every transport.

## Dev flow

Set `AUTH_SECRET`, register via `POST /auth/register`, log in, then call protected
routes with either the `Authorization` header (token from the login `Set-Cookie`) or
the `auth_token` cookie.
