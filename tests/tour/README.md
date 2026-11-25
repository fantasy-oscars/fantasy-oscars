# Player tour

One long journey through a season, from a player's side, that screenshots every screen
they meet. It is for dogfooding and design review, not a test of behaviour, and it is
not part of CI.

```bash
pnpm --filter @fantasy-oscars/shared build   # once, as for the e2e suite
pnpm run tour                                # needs Docker
open tests/tour/runs/latest/index.html       # the static gallery
pnpm run tour:inspect                        # or step through it and take notes
```

It reuses the e2e stack (a throwaway Postgres container, the API and a test build of the
web app) and takes about ten minutes, most of it waiting out pick clocks. Set
`E2E_WEB_PORT` and `E2E_API_PORT` to run it next to the e2e suite. If either port (4173 and
4174 by default) is already in use, the run stops at once with a message naming the port;
free it (`lsof -nP -iTCP:<port> -sTCP:LISTEN`) or pick other ports. The stack's servers stop
with the run, even when it is killed.

## Runs

Each run writes to `tests/tour/runs/<YYYY-MM-DD-HHmm>/` (local time; a `-2` suffix if that
minute is taken): numbered PNGs, a `manifest.json`, `skipped.txt` and the `index.html`
gallery. `tests/tour/runs/latest` is a symlink to the newest run. The images stay out of
Source Control: `tests/tour/runs/.gitignore` ignores everything but itself, which is what
keeps the directory in the repo.

After a run, the newest three runs are kept and older ones are deleted, except any run
with notes (a `notes.json` with text in it), which is never deleted. That leaves the
previous run beside the new one to check a fix against. `TOUR_OUTPUT_DIR` writes one run to
that directory instead (emptied first, not pruned, no `latest` link). To rebuild a gallery:
`node tests/tour/gallery.mjs [run]`.

## Inspector

```bash
pnpm run tour:inspect [run]    # default: latest; http://localhost:4400
```

A small page for going through a run and taking notes: the shot large, with its number,
title, caption, persona, path and day; a note box under it; a list of every shot by section
with a dot on those that have notes. No dependencies and no build step (`inspect.mjs`, the
page in `inspector/`). `TOUR_INSPECT_PORT` changes the port. It listens on localhost only.

| Key                  | Does                                               |
| -------------------- | -------------------------------------------------- |
| `→` / `j`, `←` / `k` | next, previous shot                                |
| `n`                  | focus the note box                                 |
| `Tab`                | reach the **Run** dropdown (shot keys pause there) |
| `Esc`                | leave the note box (keys move shots again)         |
| `c`                  | show the same shot from the previous run, and back |

The header has a **Run** dropdown listing every run newest first, the newest marked
"(latest)" and runs with notes marked "notes". Choosing one loads it in place at its first
shot, with its own notes and its own previous run for `c`; unsaved note text is saved first.
The URL follows the choice (`?run=<name>`, plus `#<shot file>`), so reload and back/forward
keep it; a reload with no `run` parameter opens the run the server started on (the latest, or the
`[run]` argument), and an unknown name shows the
load error. With
`TOUR_OUTPUT_DIR` there is one run.

`c` matches by file name without its number (`042-hub.png` and `045-hub.png` are the same
shot), so it still works when steps were added. It does nothing for a shot the previous run
did not have, and is unavailable with `TOUR_OUTPUT_DIR`.

Notes save by themselves a moment after typing, to `<run>/notes.json` (`{ "<shot file>":
"<text>" }`), so closing the tab or the server loses nothing, and a run with notes is never
pruned. **Finish** writes `<run>/notes.md` and shows it with a Copy button: one entry per
noted shot in tour order, `### <number> · <title>` then path, persona, day and the note. The
number is the one to cite ("tour 089"). Finish again after more notes to rewrite it.

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
