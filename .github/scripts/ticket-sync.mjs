#!/usr/bin/env node
/**
 * Sync GitHub issues down to a local JSON snapshot (one-way: GitHub → local).
 *
 * Usage:
 *   npm run ticket:sync -- --state all
 *   npm run ticket:sync -- --updated-since 2026-01-01T00:00:00Z
 *   npm run ticket:sync -- --repo owner/name --out .dev/issues.json
 *
 * Notes:
 * - Requires `GITHUB_TOKEN` with repo read access.
 * - Output defaults to `.dev/github-issues/<owner>_<repo>.json`.
 */

import { requireGitHubToken, inferRepoFullName } from "./lib/github.mjs";
import { fetchIssuesSnapshot } from "./lib/sync-issues.mjs";
import { defaultIssuesSnapshotPath, writeJsonAtomic } from "./lib/local-snapshot.mjs";

function parseArgs(argv) {
  const args = {
    repo: undefined,
    out: undefined,
    state: "all",
    max: undefined,
    updatedSince: undefined,
    includeBody: true,
    includeProjects: true
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--repo") args.repo = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--state") args.state = argv[++i];
    else if (arg === "--max") args.max = Number(argv[++i]);
    else if (arg === "--updated-since") args.updatedSince = argv[++i];
    else if (arg === "--no-body") args.includeBody = false;
    else if (arg === "--no-projects") args.includeProjects = false;
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = requireGitHubToken();
  const repoFullName = inferRepoFullName(args.repo);

  const max = args.max === undefined ? Infinity : args.max;
  if (Number.isNaN(max) || max <= 0) throw new Error("Invalid --max (must be a positive number)");

  const snapshot = await fetchIssuesSnapshot({
    token,
    repoFullName,
    state: args.state,
    max,
    updatedSince: args.updatedSince,
    includeBody: args.includeBody,
    includeProjects: args.includeProjects
  });

  const outPath = args.out ?? defaultIssuesSnapshotPath(repoFullName);
  await writeJsonAtomic(outPath, snapshot);

  console.log(`Wrote ${snapshot.issues.length} issues → ${outPath}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

