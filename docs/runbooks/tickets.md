# Tickets (GitHub Issues)

This repo includes a few small scripts under `.github/scripts/` for working with GitHub issues during development.

## Requirements

- Authenticate `gh` CLI (`gh auth login`); ensure it has repo access and project access for project field operations.
- Run from inside the repo (or pass `--repo owner/name`).

## Scripts

- Sync issues down to a local snapshot (one-way: GitHub → local): `pnpm run ticket:sync -- --state all`
  - Writes to `.dev/github-issues/<owner>_<repo>.json` by default (gitignored).
  - Helpful flags: `--updated-since <iso>`, `--max <n>`, `--no-body`, `--no-projects`, `--out <path>`.
  - Best-effort relationships: `dependsOn` is derived from a `## Depends On` section in the issue body.
- Pull a single issue’s metadata (including project fields): `pnpm run ticket:pull -- --issue 6`
  - Add `--write [--out path]` to update the local snapshot in place without a full sync (defaults to `.dev/github-issues/<owner>_<repo>.json`).
- Apply GitHub “Issue Dependencies” from the issue body: `pnpm run ticket:deps -- --issue 6 --apply`
  - Reads `## Depends On` and sets GitHub blocked-by dependencies.
- Create a new issue and add it to the project: `pnpm run ticket:create -- --title "..." --body-file ...`
- Post a comment to an issue: `pnpm run ticket:comment -- --issue 6 --body "..."` (or pipe stdin)
- Update a project “Status” field for an issue: `pnpm run ticket:status -- --issue 6 --status doing`
- Load the golden nominees dataset into the DB: `pnpm run nominees:load --workspace @fantasy-oscars/api`

## Roadmap import (issues-only, no Project)

For MVP, prefer plain issues + labels + milestones (no GitHub Project). This repo provides a safe importer that:

- Renders each ticket into a clean Markdown issue body (for review).
- Optionally creates the required milestones/labels.
- Optionally creates issues in the repository, in index order.

Dry-run (recommended first):

`pnpm run ticket:import-roadmap -- --roadmap .dev/github-issues/fantasy-oscars-mvp-mar1-2026.json`

Apply to GitHub (creates milestones/labels/issues):

`pnpm run ticket:import-roadmap -- --roadmap .dev/github-issues/fantasy-oscars-mvp-mar1-2026.json --apply`

Notes:

- Output Markdown is written under `.dev/github-issues/generated/<owner>_<repo>/...` for review.
- The importer assigns labels for `scope:*`, `ws:*`, `risk:*`, `blocking:true`, and `batch:*`.
