# Runbook: Production Smoke Check (Backend API)

Purpose: verify the deployed API is reachable and behaving sanely before/after deploys.

## Environment

- Base URL: `https://fantasy-oscars-api-prod.onrender.com`

## Checks (non-mutating)

1) Health is OK

```bash
curl -sS https://fantasy-oscars-api-prod.onrender.com/health
```

Expected: JSON with `ok: true` (and service/status fields).

1) Auth is enforced (unauthenticated request)

```bash
curl -i https://fantasy-oscars-api-prod.onrender.com/auth/me
```

Expected: `401` with JSON error `{ code: "UNAUTHORIZED" }`.

1) Unknown route returns JSON 404

```bash
curl -i https://fantasy-oscars-api-prod.onrender.com/does-not-exist
```

Expected: `404` with JSON error `{ code: "NOT_FOUND" }`.

1) CORS preflight for local dev works (optional)

```bash
curl -i -X OPTIONS 'https://fantasy-oscars-api-prod.onrender.com/auth/me' \
  -H 'Origin: http://localhost:5173' \
  -H 'Access-Control-Request-Method: GET'
```

Expected: `200` with `access-control-allow-origin: http://localhost:5173`.
