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

## Environment Variables (production)

| Name | Used by | Purpose | Stored in |
| --- | --- | --- | --- |
| `DATABASE_URL` | API | Postgres connection string (Render managed) | Render API service env |
| `AUTH_SECRET` | API | Sign/verify auth tokens | Render API service env |
| `CORS_ALLOWED_ORIGINS` | API | Comma-separated origins (set to `https://fantasy-oscars.onrender.com`) | Render API service env |
| `REALTIME_ENABLED` | API | Optional kill switch for Socket.IO (`true`/`false`, default `true`) | Render API service env |
| `PORT` | API | Provided by Render; do not override | Render API service env |
| `VITE_API_BASE` | Web | Points frontend to prod API (`https://fantasy-oscars-api-prod.onrender.com`) | Render web service env |

Secret storage: Render dashboard → Service → Environment → Environment Variables/Secret Files. Do not check into VCS.

## Custom Domain / DNS Plan

- **Current state:** Using Render-provided URLs above; no custom domain configured.
- **DNS ownership:** Not configured; when a custom domain is chosen, create CNAMEs to the Render frontend and API services respectively.
- **When to update:** Only after selecting domains; update DNS and add matching origins to `CORS_ALLOWED_ORIGINS`, `VITE_API_BASE`, and cookie domain if moved under a common parent.

## Deployment Steps (high level)

1) Merge to `main` (Render auto-deploys web + API).
2) Verify in Render dashboard that both services deployed successfully.
3) Smoke tests:
   - `curl -sS https://fantasy-oscars-api-prod.onrender.com/health`
   - Load `https://fantasy-oscars.onrender.com` and confirm `/auth/me` succeeds/401 as expected.
   - Socket.IO connects from the web app (draft room loads without console CORS errors).

For rollback and operational procedures, see `docs/runbooks/operational-runbook.md`.
