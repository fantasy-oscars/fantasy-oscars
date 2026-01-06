# Tickets (GitHub Issues)

This repo includes a few small scripts under `.github/scripts/` for working with GitHub issues during development.

## Requirements

- Set `GITHUB_TOKEN` (repo access; project access only needed for project field operations).
- Run from inside the repo (or pass `--repo owner/name`).

## Scripts

- Sync issues down to a local snapshot (one-way: GitHub → local): `npm run ticket:sync -- --state all`
  - Writes to `.dev/github-issues/<owner>_<repo>.json` by default (gitignored).
  - Helpful flags: `--updated-since <iso>`, `--max <n>`, `--no-body`, `--no-projects`, `--out <path>`.
  - Best-effort relationships: `dependsOn` is derived from a `## Depends On` section in the issue body.
- Pull a single issue’s metadata (including project fields): `npm run ticket:pull -- --issue 6`
  - Add `--write [--out path]` to update the local snapshot in place without a full sync (defaults to `.dev/github-issues/<owner>_<repo>.json`).
- Apply GitHub “Issue Dependencies” from the issue body: `npm run ticket:deps -- --issue 6 --apply`
  - Reads `## Depends On` and sets GitHub blocked-by dependencies.
- Create a new issue and add it to the project: `npm run ticket:create -- --title "..." --body-file ...`
- Post a comment to an issue: `npm run ticket:comment -- --issue 6 --body "..."` (or pipe stdin)
- Update a project “Status” field for an issue: `npm run ticket:status -- --issue 6 --status doing`
- Load the golden nominees dataset into the DB: `npm run nominees:load --workspace @fantasy-oscars/api`
