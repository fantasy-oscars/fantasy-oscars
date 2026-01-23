# Go-Live Checklist & Smoke Plan (Prod)

Use this as the final gate before opening Mar 1 traffic. Target duration: <15 minutes.

## Preflight (one-time per go-live)

- [ ] `GET https://fantasy-oscars-api-prod.onrender.com/health` returns `{ ok: true, service: "api", status: "healthy" }`.
- [ ] Migrations applied: `psql "$DATABASE_URL" -c "SELECT count(*) FROM migration_history;"` matches repo migrations; no pending files.
- [ ] Admin bootstrap done: prod admin can sign in and sees Admin console.
- [ ] Active ceremony set to current year (`POST /admin/ceremony/active` previously run; Admin UI shows the right ID).
- [ ] Nominees JSON uploaded for active ceremony (Admin → Nominees shows success, categories visible in Winners tab).
- [ ] Admin Winners UI reachable and shows draft lock pill state.

## Smoke Test (happy path, <15 min)

1) **Register + login**: create a new user in prod UI; expect successful login and `/auth/me` shows the handle.
2) **Create league + season**: create a league (auto season); expect league card visible.
3) **Invite claim**: generate an invite for another browser (or incognito) and claim it; expect membership reflected.
4) **Start draft**: as commissioner, start draft; expect draft room loads and Socket.IO connects (no CORS/auth errors).
5) **Submit pick**: make first pick; expect turn advances and pick appears in UI.
6) **Pause/resume draft**: pause then resume; expect pick submission blocked while paused and allowed after resume.
7) **Enter first winner (admin)**: in Admin → Winners, save a winner; expect success message and draft lock toggles to locked.
8) **Pick blocked after winner**: return to draft room, attempt another pick; expect rejection due to draft lock.

Record any failures with timestamps and paths to correlate with logs.

## Rollback Notes

- **Code rollback:** Render → redeploy previous successful build for web/API (see deployment runbook). Safe.
- **DB migrations/data:** Not auto-reversible. If a migration causes issues, restore from provider backup; winner lock and ceremony changes are irreversible without DB restore.
- **Config/env:** revert in Render dashboard; restart service to apply.
