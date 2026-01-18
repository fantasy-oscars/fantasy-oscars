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

For hosting topology, origins, and secrets, see [deployment runbook](deployment.md).

## Config (must-have env vars)

- API: `DATABASE_URL`, `AUTH_SECRET`, `CORS_ALLOWED_ORIGINS`, `REALTIME_ENABLED` (optional, default true).
- Frontend: `VITE_API_BASE=https://fantasy-oscars-api-prod.onrender.com`

## Troubleshooting Cheatsheet

- Health returns 500: check API logs for stack/error code.
- 401 on `/auth/me` while logged in: likely missing/expired auth cookie or wrong API base in frontend.
- CORS errors in browser: ensure `CORS_ALLOWED_ORIGINS` includes the frontend origin; redeploy API.
- DB connection errors: confirm `DATABASE_URL` password matches the current Postgres user password.
- Build failures (frontend): re-run `npm install && npm run build --workspace @fantasy-oscars/web` locally to reproduce.

## Annual Ceremony Rollover (example: archive 2026 → create/activate 2027)

Goal: close out the prior ceremony, keep its data readable, and stand up the next ceremony with drafting reopened. All admin/API actions are scoped to the *active* ceremony; prior ceremonies become effectively read-only once a new active ceremony is set.

### Guardrails & lock rule

- Drafting is *permanently* locked for a ceremony once the first winner is saved (`ceremony.draft_locked_at` set). There is no unlock; the only way to reopen drafts is to move to a new ceremony.
- Winners entry, nominee upload, league/draft creation/start/picks all **require the active ceremony**. If the ceremony is not active, these calls fail with `CEREMONY_INACTIVE` / `Active ceremony is not configured`.
- Existing seasons/drafts tied to an older ceremony stay visible but are inert: no new picks or starts; standings remain view-only.

### Prereqs

- Admin user signed in (UI) or admin token/cookie (API).
- New ceremony id/code/year selected (coordinate to avoid id collisions).
- Nominees dataset JSON for the new ceremony that includes a `ceremonies` entry with that id.

### Steps

1) **Freeze the outgoing ceremony (e.g., 2026)**
   - Ensure all winners are entered in Admin → Winners. Saving the *first* winner should show the lock warning modal; after saving, confirm the lock pill reads “Drafts locked”.
   - API check (optional): `GET /ceremony/active/lock` → `draft_locked: true` once any winner exists.

2) **Insert the new ceremony record**
   - One-time SQL (psql or Render console), adjust values:

     ```sql
     INSERT INTO ceremony (id, code, name, year, starts_at)
     VALUES (2027, 'oscars-2027', 'Oscars 2027', 2027, NULL)
     ON CONFLICT (id) DO NOTHING;
     ```

   - Verify: `SELECT id, code, year FROM ceremony WHERE id = 2027;`

3) **Activate the new ceremony**
   - Admin UI: Admin → Active ceremony → enter `2027` → “Update active ceremony” (confirm dialog).
   - Or API: `curl -X POST https://fantasy-oscars-api-prod.onrender.com/admin/ceremony/active -H "Content-Type: application/json" --data '{"ceremony_id":2027}'` (with admin cookie/token).
   - Verify: `GET /ceremony/active` returns the new id/code/year.

4) **Load nominees for the new ceremony**
   - Admin UI: in Nominees, upload the JSON dataset (must include the active ceremony id). Wait for success status; refresh winners panel to pull the fresh categories.
   - Or API: `curl -X POST https://fantasy-oscars-api-prod.onrender.com/admin/nominees/upload -H "Content-Type: application/json" --data @/path/to/oscars-2027-nominees.json` (admin auth required).
   - Verify: `GET /ceremony/active/nominations` returns non-empty list for the new ceremony.

5) **Reopen drafting for the new year**
   - Leagues created now will be tied to the active ceremony automatically; commissioners can start new seasons/drafts as usual.
   - Confirm `GET /ceremony/active/lock` shows `draft_locked: false` (no winners yet), and the admin Winners panel shows “Drafts open” pill.

6) **Smoke older data is read-only**
   - Attempting to start a draft or enter winners for the prior ceremony should fail unless you re-activate that ceremony (do not do so in prod).
   - Standings and historical seasons remain visible; no further writes occur without reactivating the old ceremony.

7) **Post-rollover checklist**

- Admin UI: upload nominees success message logged; categories render with radio buttons.
- Admin UI: Winners page shows empty winners and unlocked state.
- Optional API spot-checks:
  - `GET /ceremony/active/winners` → empty array.
  - `GET /ceremony/active/lock` → `draft_locked: false`.
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
npm run admin:bootstrap -- \
  --handle admin \
  --email admin@example.com \
  --display-name "Fantasy Admin" \
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
