# Dependency Updates

## TL;DR

- Dependabot opens at most one grouped minor/patch PR per month, plus one PR per major upgrade.
- Merge the grouped PR when CI is green. Majors need a read of the changelog first.
- Don't let update PRs sit: merge, or close with a one-line reason, within the month.

## What Dependabot opens

Configured in `.github/dependabot.yml`.

| PR | Cadence | Action |
| --- | --- | --- |
| `minor-and-patch` group (npm) | Monthly | Merge if CI is green. If CI fails, fix forward on the PR branch or close and note why. |
| Single major upgrade | Monthly, as released | Read the changelog. If it needs code changes, close it and do the upgrade in its own branch with those changes. |
| `actions` group (GitHub Actions) | Monthly | Merge if CI is green. |
| Security update | When an advisory is published | Merge promptly; these are not held for the monthly batch. |

## Rules

- **Node and `@types/node` move together.** The runtime is pinned in `.nvmrc`, `engines` and CI. Major `@types/node` updates are ignored; bump them as part of a deliberate Node upgrade.
- **Stale PRs are closed, not rebased.** A PR more than a month old conflicts with the lockfile and is superseded by the next batch.
- **Lockfile refresh by hand.** When batches have been skipped, run `pnpm update -r` (stays within declared ranges), then `pnpm run ci`, and open one `chore(deps)` PR.
- **New dependencies** follow the [Engineering Standard](engineering-standard.md): justified in the PR, ADR if non-default.
