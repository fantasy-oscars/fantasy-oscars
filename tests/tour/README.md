# Player tour

One long journey through a season, from a player's side, that screenshots every screen
they meet. It is for dogfooding and design review, not a test of behaviour, and it is
not part of CI.

```bash
pnpm --filter @fantasy-oscars/shared build   # once, as for the e2e suite
pnpm run tour                                # needs Docker
open tour-output/index.html
```

It reuses the e2e stack (a throwaway Postgres container, the API and a test build of the
web app) and takes about ten minutes, most of it waiting out pick clocks. Set
`E2E_WEB_PORT` and `E2E_API_PORT` to run it next to the e2e suite. Output goes to
`tour-output/` (ignored by git; `TOUR_OUTPUT_DIR` overrides): numbered PNGs, a
`manifest.json`, `skipped.txt` and the `index.html` gallery.

## What it covers

Theme Refined Gold, light mode, 1440 × 900, full-page captures. Admin screens are left
out; admin work (results, finalising, score rebuilds) goes through the API. The
commissioner, cora, is a super admin because only super admins may start a full awards
season, so her screens show the admin entry.

1. A first visit while signed out: Home, the static pages, sign-in, registration, password
   reset and the 404.
2. Starting a league: empty lists, creating a league and a single-ceremony season, an
   invite by username and an invite link claimed by a new account.
3. The single-ceremony draft, from both sides.
4. Setting up a full awards season: the form and its settings modals, joining and
   initialising.
5. The season draft: lobby, start, the pick panel and picker, waiting, a timed-out pick
   auto-drafted from a queue, a miss and its supplemental pick turning into a chip, and
   the finished board.
6. Day 0, in season: rosters, free agency with a drop, transactions, waivers, standings.
7. Day 2: nominations score and a waiver window opens; claims, including a chipped one.
8. Day 5: the window resolves; results, transactions and free agency reopened.
9. Day 7: the first ceremony's winners score.
10. Day 15: the final ceremony, final standings and the single-ceremony results.

## How time passes

Waiver windows, the ownership instant and scoring compare stored dates with now. The tour
never touches the system clock: `advanceDays` (support/clock.ts) moves every date and
timestamp in the Circuit tables, and the Circuit's ceremony dates, back by the same number
of days, which reads to the app exactly as if those days had passed. Waiver runs then go
through `apps/api/src/scripts/run-circuit-waivers.ts`, as in the operational runbook.

## When a step changes

Steps that only dress a screenshot (opening a modal, a picker) are wrapped in `attempt`:
when a label changes, the step is listed in `skipped.txt` and in the gallery, and the tour
carries on. State changes the later screens depend on go through the API and fail the run.
