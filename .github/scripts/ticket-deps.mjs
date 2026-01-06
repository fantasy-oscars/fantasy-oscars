#!/usr/bin/env node
/**
 * Apply GitHub Issue Dependencies based on the issue body "## Depends On" section.
 *
 * Usage:
 *   npm run ticket:deps -- --issue 95 --repo owner/name
 *   npm run ticket:deps -- --issue 95 --repo owner/name --apply
 *
 * Notes:
 * - Requires GITHUB_TOKEN with repo access.
 * - By default, prints what it would do. Use --apply to mutate GitHub.
 */

import { requireGitHubToken, inferRepoFullName } from "./lib/github.mjs";
import { fetchIssue } from "./lib/sync-issues.mjs";
import { addBlockedBy, listBlockedBy } from "./lib/issue-dependencies.mjs";

function parseArgs(argv) {
  const args = { issue: undefined, repo: undefined, apply: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--issue") args.issue = Number(argv[++i]);
    else if (arg === "--repo") args.repo = argv[++i];
    else if (arg === "--apply") args.apply = true;
  }
  return args;
}

async function main() {
  const { issue, repo, apply } = parseArgs(process.argv.slice(2));
  if (!issue || Number.isNaN(issue)) throw new Error("Issue number required (--issue)");

  const token = requireGitHubToken();
  const repoFullName = inferRepoFullName(repo);

  const local = await fetchIssue({ token, repoFullName, number: issue });
  const desired = new Set(local.dependsOn ?? []);
  const existing = new Set(await listBlockedBy(token, { repo: repoFullName, issue }));

  const toAdd = [...desired].filter((n) => !existing.has(n));

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          issue,
          repo: repoFullName,
          desiredBlockedBy: [...desired].sort((a, b) => a - b),
          existingBlockedBy: [...existing].sort((a, b) => a - b),
          wouldAdd: toAdd.sort((a, b) => a - b)
        },
        null,
        2
      )
    );
    return;
  }

  for (const dep of toAdd) {
    await addBlockedBy(token, { repo: repoFullName, issue, blockedBy: dep });
  }

  console.log(`Added ${toAdd.length} blocked-by dependencies to #${issue}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

