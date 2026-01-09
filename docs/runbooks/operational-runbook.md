# Operational Runbook (Prod)

Purpose: quick reference for deploying, rolling back, validating health, and basic troubleshooting of the Fantasy Oscars production stack on Render.

## Environments & Endpoints

- API: <https://fantasy-oscars-api-prod.onrender.com>
- Frontend: <https://fantasy-oscars.onrender.com>
- Health: <https://fantasy-oscars-api-prod.onrender.com/health>

## Deploy

### Backend (API, Render Web Service)

1. Merge to `main` (auto-deploy on Render).
2. Verify deploy event in Render → Service → Events.
3. Smoke: `curl -sS https://fantasy-oscars-api-prod.onrender.com/health`.

### Frontend (Render Static Site)

1. Merge to `main` (auto-deploy on Render).
2. Verify deploy event.
3. Smoke: load <https://fantasy-oscars.onrender.com> and check Network `/auth/me` hits the API.

## Rollback

- Backend: Render → API service → Deploys → Redeploy previous successful commit.
- Frontend: Render → Static Site → Deploys → Redeploy previous successful commit.

## Health & Smoke Checklist

Run these after deploys or incidents:

1) API health: `curl -sS https://fantasy-oscars-api-prod.onrender.com/health`
2) Auth unauth path: `curl -i https://fantasy-oscars-api-prod.onrender.com/auth/me` (expect 401 JSON)
3) 404 JSON: `curl -i https://fantasy-oscars-api-prod.onrender.com/does-not-exist` (expect JSON NOT_FOUND)
4) CORS preflight (frontend):

```bash
curl -i -X OPTIONS 'https://fantasy-oscars-api-prod.onrender.com/auth/me' \
  -H 'Origin: https://fantasy-oscars.onrender.com' \
  -H 'Access-Control-Request-Method: GET'
```

## Logs

- Backend logs: Render → API service → Logs.
- Frontend (static) has no runtime logs; failures show in browser console/Network.

## Config (must-have env vars)

- API: `DATABASE_URL`, `AUTH_SECRET`, `CORS_ALLOWED_ORIGINS`, `REALTIME_ENABLED` (optional, default true).
- Frontend: `VITE_API_BASE=https://fantasy-oscars-api-prod.onrender.com`

## Troubleshooting Cheatsheet

- Health returns 500: check API logs for stack/error code.
- 401 on `/auth/me` while logged in: likely missing/expired auth cookie or wrong API base in frontend.
- CORS errors in browser: ensure `CORS_ALLOWED_ORIGINS` includes the frontend origin; redeploy API.
- DB connection errors: confirm `DATABASE_URL` password matches the current Postgres user password.
- Build failures (frontend): re-run `npm install && npm run build --workspace @fantasy-oscars/web` locally to reproduce.
