# Operational Runbook (Prod)

Purpose: quick reference for deploying, rolling back, validating health, and basic troubleshooting of the Fantasy Oscars production stack on Render.

## Environments & Endpoints

- API: <https://api.fantasy-oscars.com>
- Frontend: <https://www.fantasy-oscars.com>
- Health: <https://api.fantasy-oscars.com/health>

## Deploy

### Backend (API, Render Web Service)

1. Merge to `main` (auto-deploy on Render).
2. Verify deploy event in Render → Service → Events.
3. Smoke: `curl -sS https://api.fantasy-oscars.com/health`.

### Frontend (Render Static Site)

1. Merge to `main` (auto-deploy on Render).
2. Verify deploy event.
3. Smoke: load <https://www.fantasy-oscars.com> and check Network `/auth/me` hits the API.

## Rollback

- Backend: Render → API service → Deploys → Redeploy previous successful commit.
- Frontend: Render → Static Site → Deploys → Redeploy previous successful commit.

## Health & Smoke Checklist

Run these after deploys or incidents:

1) API health: `curl -sS https://fantasy-oscars-api-prod.onrender.com/health`
2) Auth unauth path: `curl -i https://api.fantasy-oscars.com/auth/me` (expect 401 JSON)
3) 404 JSON: `curl -i https://api.fantasy-oscars.com/does-not-exist` (expect JSON NOT_FOUND)
4) CORS preflight (frontend):

```bash
curl -i -X OPTIONS 'https://api.fantasy-oscars.com/auth/me' \
  -H 'Origin: https://www.fantasy-oscars.com' \
  -H 'Access-Control-Request-Method: GET'
```

## Logs

- Backend logs: Render → API service → Logs.
- Frontend (static) has no runtime logs; failures show in browser console/Network.

For hosting topology, origins, and secrets, see [deployment runbook](deployment.md).

Go-live gate: follow [go-live checklist & smoke plan](go-live.md) before opening traffic.

## Config (must-have env vars)

- API: `DATABASE_URL`, `AUTH_SECRET`, `CORS_ALLOWED_ORIGINS`, `REALTIME_ENABLED` (optional, default true).
- Frontend: `VITE_API_BASE=https://api.fantasy-oscars.com`

## Troubleshooting Cheatsheet

- Health returns 500: check API logs for stack/error code.
- 401 on `/auth/me` while logged in: likely missing/expired auth cookie or wrong API base in frontend.
- CORS errors in browser: ensure `CORS_ALLOWED_ORIGINS` includes the frontend origin; redeploy API.
- DB connection errors: confirm `DATABASE_URL` password matches the current Postgres user password.
- Build failures (frontend): re-run `pnpm install && pnpm run build --filter @fantasy-oscars/web` locally to reproduce.

## Annual Ceremony Rollover (example: archive 2026 → create 2027)

Goal: close out the prior ceremony, keep its data readable, and stand up the next ceremony with drafting opened for new seasons.

### Guardrails & lock rule

- Drafting is locked for a ceremony once results entry begins (winners are saved) and remains locked through completion/archival.
- Existing seasons/drafts tied to an older ceremony stay visible historically; new drafts should be created on new seasons tied to the new ceremony.

### Prereqs

- Admin user signed in (UI) or admin token/cookie (API).
- Nominees dataset JSON for the new ceremony (if using bulk upload tooling).

### Steps

1) **Freeze the outgoing ceremony (e.g., 2026)**
   - Ensure all winners are entered in Admin → Results/Winners.
   - Finalize winners (if the UI supports a finalize action), then set ceremony status to Complete/Archived as appropriate.

2) **Create the new ceremony record**
   - Use Admin → Ceremonies → New ceremony (preferred).
   - Fill identity (name/code/year), add categories, then populate nominees.

3) **Publish the ceremony**
   - Once categories and nominees are ready, publish the ceremony so users can create seasons against it.

4) **Open drafting for the new year**
   - Commissioners can now create seasons for the new ceremony and draft as usual.

5) **Smoke**
   - Confirm old seasons remain visible.
   - Confirm new ceremony is visible in the Ceremonies index and can be selected when creating a season.

6) **Post-rollover checklist**

- Admin UI: upload nominees success message logged; categories render with radio buttons.
- Admin UI: Winners page shows empty winners and unlocked state.
- Communicate to commissioners that drafts for the new ceremony are now open; remind them drafting will lock immediately when the first winner is saved.

## Bootstrap First Production Admin (one-time, safe path)

Goal: create/promote a single admin without direct SQL. Uses a one-time secret stored in Render.

Preconditions:

- Render API service has `ADMIN_BOOTSTRAP_SECRET` set to a strong random value.
- Render API service has `DATABASE_URL` configured.

Steps (from Render Shell on the API service):

```bash
export DATABASE_URL="$DATABASE_URL"
export ADMIN_BOOTSTRAP_SECRET="$ADMIN_BOOTSTRAP_SECRET" # Render injects it
pnpm run admin:bootstrap -- \
  --username admin \
  --email admin@example.com \
  --password 'TempAdminP@ss123' \
  --secret "$ADMIN_BOOTSTRAP_SECRET"
```

Behavior:

- Creates the user if missing; otherwise promotes existing user to `is_admin=true`.
- Resets the password to the provided value; logs result to stdout.

Post-steps:

1) Log in via web UI with the admin creds; open Admin section to confirm access.
2) Call an admin endpoint (e.g., set active ceremony) to verify authorization.
3) Rotate `ADMIN_BOOTSTRAP_SECRET` to a new random value or remove it to disable further use.

## Observability (Render)

- **API logs:** Render dashboard → API service → Logs. Use the search box to filter by path snippets (`/drafts`, `/auth`, `/admin`, `/ceremony`). For a time window, set the time filter (e.g., “past 1h”) then search; copy/paste logs for incident notes.
- **Realtime (Socket.IO) checks:**
  - Browser Network tab: websocket upgrade to `https://api.fantasy-oscars.com/socket.io/…` should return 101. Failures show 4xx (auth) or 5xx; check console for CORS errors.
  - Common API error codes: `401/403` (unauthenticated/unauthorized), `409 CEREMONY_INACTIVE` (wrong ceremony), `409 ACTIVE_CEREMONY_NOT_SET`, `409 DRAFTS_LOCKED` (winners entered).
- **Web runtime errors:** Static site has no server logs; use browser console + Network tab. If a client error corresponds to API failures, correlate timestamps with API logs above.
- **Healthy signals:** `GET /health` returns `{ ok: true, service: "api", status: "healthy" }`; Socket.IO connects without retry loops; `/auth/me` returns 200 for authenticated users and 401 for logged-out sessions.
