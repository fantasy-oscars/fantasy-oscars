# Deployment Runbook (Prod Topology & Secrets)

Source of truth for how the MVP is deployed, the exact origins in play, and where secrets live.

## Topology & Hosting

- **Frontend (web):** Render Static Site — `https://fantasy-oscars.onrender.com`
- **API + realtime (Socket.IO):** Render Web Service — `https://fantasy-oscars-api-prod.onrender.com`
- **Database:** Render Managed Postgres (single primary). Connection string exposed as `DATABASE_URL`.
- **Realtime:** Socket.IO served from the API service over HTTPS/WSS on the same origin as the API.

No separate CDN or multi-region topology in MVP; single Render region.

## Origins, Cookies, and CORS

- **Web origin:** `https://fantasy-oscars.onrender.com`
- **API origin:** `https://fantasy-oscars-api-prod.onrender.com`
- **Allowed origins (CORS):** `https://fantasy-oscars.onrender.com`
- **Credentials:** frontend uses `fetch` with `credentials: "include"`; API must have CORS allow-credentials enabled for the web origin.
- **Cookies (auth):** issued by API. Attributes: `Secure`, `SameSite=None`, `HttpOnly`; domain defaults to `fantasy-oscars-api-prod.onrender.com` (no custom domain yet). Works cross-site with the allowed origin list above.

## Hosting modes

- **Cross-origin (legacy Render setup, no longer supported for browsers):** web and API on separate sites. The web app authenticates by the HttpOnly cookie only and no longer keeps a bearer token in `localStorage`, so this mode works only in browsers that accept third-party cookies (`AUTH_COOKIE_SAMESITE=none`, Secure); iOS Safari and other browsers that block them cannot sign in. Use same-origin mode.
- **Same-origin (VPS, current):** one reverse proxy serves the web build at `/` and proxies `/api/*` to the API with the `/api` prefix stripped (the API's routes and Socket.IO path are unchanged). Build the web app with `VITE_API_BASE=/api`: HTTP calls go to `/api/...` and the Socket.IO client connects to the page origin with `path: "/api/socket.io"`. Set `AUTH_COOKIE_SAMESITE=lax` on the API. Keep the web origin (`https://www.fantasy-oscars.com`) in `CORS_ALLOWED_ORIGINS` even though requests are same-origin: browsers still send `Origin` on websocket upgrades and on logout and account deletion, and the API rejects origins that aren't listed. `api.fantasy-oscars.com` remains as an unprefixed alias for tabs opened before the cookie-only change (their socket `auth` payload is still accepted; see [auth.md](auth.md#credential-transports)) and will be retired. The browser sends the cookie on the login fetch, later requests and the websocket upgrade because all are same-origin; no token is stored or sent by the web app. Users who signed in before the cookie-only change (including everyone from the Render era, whose cookie belonged to the API host) are asked to sign in once more; their stale `localStorage` token is deleted on the next page load.
- Local dev can use same-origin mode too: set `VITE_API_BASE=/api` and the Vite dev server proxies `/api` to `http://localhost:4010`.

## Environment Variables (production)

| Name                       | Used by | Purpose                                                                                                                                                                                                                                                                                  | Stored in              |
| -------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `DATABASE_URL`             | API     | Postgres connection string (Render managed)                                                                                                                                                                                                                                              | Render API service env |
| `AUTH_SECRET`              | API     | Sign/verify auth tokens                                                                                                                                                                                                                                                                  | Render API service env |
| `CORS_ALLOWED_ORIGINS`     | API     | Comma-separated origins (set to `https://fantasy-oscars.onrender.com`)                                                                                                                                                                                                                   | Render API service env |
| `AUTH_COOKIE_SAMESITE`     | API     | Auth cookie `SameSite`: `lax`, `strict` or `none`. Default is `none` when `NODE_ENV=production` (cross-origin Render setup) and `lax` otherwise. Set `lax` in same-origin mode. `none` is rejected unless `NODE_ENV=production` (the cookie must be Secure); unknown values fail startup | Render API service env |
| `NODE_ENV`                 | API     | Must be `production` in prod                                                                                                                                                                                                                                                             | Render API service env |
| `REALTIME_ENABLED`         | API     | Optional kill switch for Socket.IO (`true`/`false`, default `true`)                                                                                                                                                                                                                      | Render API service env |
| `TRUST_PROXY`              | API     | Express `trust proxy` setting: hop count, `true`/`false`. Defaults to `1` when `NODE_ENV=production`, otherwise `false`. Must equal the number of proxies in front of the API on any new host; too low makes all users share one rate-limit key, too high lets clients spoof their IP    | Render API service env |
| `PG_POOL_MAX`              | API     | Max Postgres connections per API instance (positive integer, default `10`). Keep instances x max below the database connection limit                                                                                                                                                     | Render API service env |
| `PG_CONNECTION_TIMEOUT_MS` | API     | Milliseconds to wait for a pooled connection before failing (default `5000`)                                                                                                                                                                                                             | Render API service env |
| `PG_IDLE_TIMEOUT_MS`       | API     | Milliseconds an idle pooled connection is kept before closing (default `30000`)                                                                                                                                                                                                          | Render API service env |
| `MIGRATE_ON_START`         | API     | Run the migrator before booting (`true`/`false`, default `true`). Set `false` when migrations run as a separate release step; the API then refuses to start if the database is behind                                                                                                    | Render API service env |
| `SHUTDOWN_TIMEOUT_MS`      | API     | Milliseconds to wait for in-flight HTTP requests on SIGTERM/SIGINT before connections are force-closed (default `10000`)                                                                                                                                                                 | Render API service env |
| `SENTRY_DSN`               | API     | Enables error tracking (5xx errors and unhandled rejections) when set; unset means Sentry is off. Request bodies, cookies and auth headers are stripped                                                                                                                                  | Render API service env |
| `SENTRY_ENVIRONMENT`       | API     | Optional environment label for Sentry events (defaults to `NODE_ENV`)                                                                                                                                                                                                                    | Render API service env |
| `MIGRATIONS_DIR`           | API     | Optional override for the migrations directory; set by the Docker image                                                                                                                                                                                                                  | Image / host env       |
| `PORT`                     | API     | Provided by Render; do not override                                                                                                                                                                                                                                                      | Render API service env |
| `ADMIN_BOOTSTRAP_SECRET`   | API     | One-time secret to run admin bootstrap script                                                                                                                                                                                                                                            | Render API service env |
| `VITE_API_BASE`            | Web     | Points frontend to prod API (`https://fantasy-oscars-api-prod.onrender.com`)                                                                                                                                                                                                             | Render web service env |

Secret storage: Render dashboard → Service → Environment → Environment Variables/Secret Files. Do not check into VCS.

## Custom Domain / DNS Plan

- **Current state:** Using Render-provided URLs above; no custom domain configured.
- **DNS ownership:** When a custom domain is chosen, create CNAMEs to the Render frontend and API services respectively (e.g., `app.example.com` → web service, `api.example.com` → API service).
- **Certificates:** Let’s Encrypt via Render (automatic issuance/renewal once DNS is validated).
- **When to update:** After DNS is active, update `CORS_ALLOWED_ORIGINS` to include the web origin, set `VITE_API_BASE` to the new API origin, and verify cookies still function (Secure, SameSite=None for cross-site).
- **If using apex + subdomain:** keep API on a subdomain (`api.example.com`) and web on `example.com` or `app.example.com`; no code changes needed, but ensure CORS allowlist and HTTPS both origins.

## Deployment Steps (high level)

1. Merge to `main` (Render auto-deploys web + API).
2. Verify in Render dashboard that both services deployed successfully.
3. Smoke tests:
   - `curl -sS https://fantasy-oscars-api-prod.onrender.com/health`
   - Load `https://fantasy-oscars.onrender.com` and confirm `/auth/me` succeeds/401 as expected.
   - Socket.IO connects from the web app (draft room loads without console CORS errors).

For rollback and operational procedures, see `docs/runbooks/operational-runbook.md`.

## API Service (Render) — build, deploy, rollback, verify

- **Build command (Render):**

  ```bash
  corepack enable
  pnpm run render:install:api
  pnpm run render:build:api
  ```

- **Start command (Render):**

  ```bash
  pnpm run render:start:api
  ```

- **Env var checklist (API):** `NODE_ENV=production`, `DATABASE_URL`, `AUTH_SECRET`, `CORS_ALLOWED_ORIGINS=https://fantasy-oscars.onrender.com`, optionally `REALTIME_ENABLED=true`. Render supplies `PORT`.
- **Deploy:** push to `main` (Render auto-deploy). If auto-deploy is disabled, trigger “Manual Deploy” in Render UI for the API service.
- **Rollback:** Render dashboard → API service → Deploys → redeploy previous successful build.

### Verification (post-deploy)

1. Health: `curl -sS https://fantasy-oscars-api-prod.onrender.com/health` should return `{ ok: true, service: "api", status: "healthy" }` (liveness, no DB). `curl -sS .../health/ready` should return HTTP 200 with `{ ok: true, db: "up", migrations: { applied, expected } }`; it returns 503 when the database is unreachable or behind. Use `/health/ready` as the load balancer readiness check.
2. HTTP session: from browser, visit web app, sign in, confirm `GET /auth/me` succeeds (200) and CORS/cookies work (no console CORS errors).
3. Socket.IO auth:
   - Open a draft room as an authorized user: websocket connects (Network tab shows `socket.io/?EIO=4...` 200/101), and events stream.
   - Attempt to join the same draft from an unauthenticated/incognito window: connection rejected (HTTP 401/403) and no events received.
4. Database connectivity: `psql "$DATABASE_URL" -c "SELECT 1;"` from Render shell succeeds (confirms secrets wired).

## Web App (Render static) — build, deploy, rollback, verify

- **Build command (Render):**

  ```bash
  corepack enable
  pnpm run render:install:web
  pnpm run render:build:web
  ```

- **Publish directory:** `apps/web/dist`
- **Env var checklist (Web):** `VITE_API_BASE=https://fantasy-oscars-api-prod.onrender.com`
- **Deploy:** push to `main` (auto-deploy). If auto-deploy is off, trigger manual deploy in Render UI for the static site.
- **Rollback:** Render dashboard → Web service → Deploys → redeploy previous successful build.

### Verification (post-deploy, browser smoke)

1. Load `https://fantasy-oscars.onrender.com`; Network `/auth/me` returns 200 with session or 401 if logged out; no CORS errors.
2. Auth cookies: login, refresh page, ensure session persists; logout clears session (401 on `/auth/me`).
3. Realtime: open a draft room (existing draft) and confirm websocket connects (Socket.IO) without console errors.
4. Minimal flow: register a new user → login → create a league → open season page; confirm league/season render without API errors.

### Custom domain verification (if configured)

1. DNS: `dig +short app.example.com` and `dig +short api.example.com` return Render-provided CNAME/A records.
2. TLS: `curl -I https://app.example.com` and `curl -I https://api.example.com/health` succeed with valid certs.
3. CORS/cookies: open the web app on the custom domain, sign in, refresh, and confirm `/auth/me` succeeds without CORS errors; logout clears the session. Confirm Socket.IO connects from the custom domain (Network → websocket upgrade 101).

## Migrations: on start vs release step

By default the API runs the migrator on every start (`MIGRATE_ON_START=true`, the Render behaviour). The migrator holds a Postgres advisory lock, so concurrent instances are safe.

On hosts with a release phase (pre-deploy command, Fly `release_command`, Kubernetes job), run migrations there instead and set `MIGRATE_ON_START=false`:

```bash
pnpm --filter @fantasy-oscars/api run migrate     # from the repo
node scripts/db-migrate.mjs                       # inside the Docker image (WORKDIR /app)
```

The same check runs in `pnpm dev`: either run `pnpm run db:migrate` first, or keep `MIGRATE_ON_START` at its default when using `pnpm start`.

At boot the API always compares `migration_history` with the migrations shipped in the build. If the database is behind it logs `migrations_check_failed` and exits non-zero, so a deploy that skipped the release step fails fast instead of serving errors.

## Running the API in Docker

Build from the repository root (the image bundles `database/migrations`):

```bash
pnpm run docker:build:api          # docker build -f apps/api/Dockerfile -t fantasy-oscars-api .
docker run --rm -p 4000:4000 \
  -e DATABASE_URL=postgres://user:pass@host:5432/db \
  -e AUTH_SECRET=change-me \
  -e CORS_ALLOWED_ORIGINS=https://app.example.com \
  fantasy-oscars-api
```

- Node 24, production dependencies only, runs as the non-root `node` user, `NODE_ENV=production`, listens on `PORT` (default `4000`).
- The default command is the same start path as Render: migrate (unless `MIGRATE_ON_START=false`), then the API.
- `HEALTHCHECK` calls `/health` (liveness, no DB) so the container probe does not keep a suspend-on-idle database awake. Use `/health/ready` for load-balancer/orchestrator readiness.
- On SIGTERM the API stops accepting connections, stops the draft sweeper, closes Socket.IO (clients reconnect to another instance), waits up to `SHUTDOWN_TIMEOUT_MS` for in-flight requests, closes the Postgres pool and exits 0. Set the host's stop grace period above `SHUTDOWN_TIMEOUT_MS` plus about 7 seconds (pool end up to 5 s, Sentry flush up to 2 s).
- Set `TRUST_PROXY` to the number of proxies in front of the container.

## Draft sweeper

The sweeper issues no queries while no timed draft is in progress. It checks once at start, then sleeps until the earliest `pick_deadline_at` (between `DRAFT_SWEEPER_INTERVAL_MS` and 30 seconds) and goes idle when none remain. Starting, resuming or advancing a timed draft wakes it. This lets a managed Postgres that suspends when idle actually suspend. `DRAFT_SWEEPER_ENABLED=false` still disables it. With several API instances, each instance wakes for drafts changed through it; the advisory lock keeps expiry processing single-worker. To cover a draft advanced by an old instance during a deploy overlap, an idle sweeper also polls every `DRAFT_SWEEPER_IDLE_POLL_MS` (default `600000`, 10 minutes; `0` disables). Trade-off: a suspend-on-idle database may wake every 10 minutes; set `0` if relying on client ticks is acceptable.

## Recommended response headers

The API sets security headers itself (`helmet`). Render static sites take headers from the dashboard (Static Site → Settings → Headers), so add these for the web app. Replace the API origin if it changes.

| Path | Header                      | Value                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/*` | `Content-Security-Policy`   | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://image.tmdb.org; connect-src 'self' https://fantasy-oscars-api-prod.onrender.com wss://fantasy-oscars-api-prod.onrender.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` |
| `/*` | `Strict-Transport-Security` | `max-age=31536000; includeSubDomains`                                                                                                                                                                                                                                                                                                                                                                  |
| `/*` | `X-Content-Type-Options`    | `nosniff`                                                                                                                                                                                                                                                                                                                                                                                              |
| `/*` | `X-Frame-Options`           | `DENY`                                                                                                                                                                                                                                                                                                                                                                                                 |
| `/*` | `Referrer-Policy`           | `strict-origin-when-cross-origin`                                                                                                                                                                                                                                                                                                                                                                      |
| `/*` | `Permissions-Policy`        | `camera=(), microphone=(), geolocation=()`                                                                                                                                                                                                                                                                                                                                                             |

Why these sources: scripts are the bundled Vite output only (`script-src 'self'`; this includes `/brand-init.js`, the small pre-paint brand script, which is a same-origin file rather than an inline script, see [brands](../architecture/brands.md)); Mantine injects inline styles, hence `'unsafe-inline'` for styles; `index.html` loads the Material Symbols stylesheet from `fonts.googleapis.com` and its font files from `fonts.gstatic.com`; text fonts are bundled through `@fontsource`; nominee posters come from `image.tmdb.org`; `connect-src` needs the `VITE_API_BASE` origin over both `https` (fetch) and `wss` (Socket.IO). If `VITE_API_BASE` changes, change both `connect-src` entries. In same-origin mode, `'self'` covers fetch, but list `wss://www.fantasy-oscars.com` explicitly as well, because some older Safari versions don't match `wss:` against `'self'`. Roll out the CSP as `Content-Security-Policy-Report-Only` first and check the browser console on the login, league and draft room pages before enforcing.
