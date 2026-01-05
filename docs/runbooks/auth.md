# Auth strategy (API)

- Strategy: short-lived (1h) HMAC JWT.
- Transport: `Authorization: Bearer <token>` **or** HttpOnly cookie `auth_token` (SameSite=Lax, Secure in prod).
- Login: `POST /auth/login` returns `{ user, token }` and sets the cookie.
- Logout: `POST /auth/logout` clears the cookie.
- Protected routes: require auth via header or cookie; 401 on missing/invalid/expired.
- Socket.IO (when added): reuse the same token (e.g., `auth_token` cookie or `Authorization` header in handshake).
- Dev flow: set `AUTH_SECRET`, register via `POST /auth/register`, login, then call protected routes with either header or the set-cookie value.
