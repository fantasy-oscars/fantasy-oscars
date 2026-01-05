#!/usr/bin/env node
/**
 * Fetch ticket metadata from GitHub (issue + project fields) for reuse.
 *
 * Usage:
 *   node .github/scripts/ticket-pull.mjs --issue 6 --repo owner/name
 *   node .github/scripts/ticket-pull.mjs --issue 6 --write [--out path]
 *
 * Notes:
 *   - Requires GITHUB_TOKEN with repo access.
 *   - Defaults repo from GITHUB_REPOSITORY if not provided.
 *   - Prints JSON by default; --write updates the local snapshot file (same shape as ticket:sync).
 */

import { readFile } from "node:fs/promises";

import { requireGitHubToken, inferRepoFullName } from "./lib/github.mjs";
import { fetchIssue } from "./lib/sync-issues.mjs";
import { defaultIssuesSnapshotPath, writeJsonAtomic } from "./lib/local-snapshot.mjs";

function parseArgs(argv) {
  const args = { issue: undefined, repo: undefined, write: false, out: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--issue") args.issue = Number(argv[++i]);
    else if (arg === "--repo") args.repo = argv[++i];
    else if (arg === "--write") args.write = true;
    else if (arg === "--out") args.out = argv[++i];
  }
  return args;
}

async function loadSnapshot(path) {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function upsertIssueInSnapshot(snapshot, issue) {
  if (!snapshot) {
    return {
      version: 1,
      repo: "",
      fetchedAt: new Date().toISOString(),
      issues: [issue]
    };
  }

  const next = { ...snapshot, fetchedAt: new Date().toISOString() };
  const idx = (next.issues ?? []).findIndex((i) => i.number === issue.number);
  if (idx >= 0) {
    next.issues[idx] = issue;
  } else {
    next.issues = [...(next.issues ?? []), issue];
  }
  return next;
}

async function main() {
  const { issue, repo, write, out } = parseArgs(process.argv.slice(2));
  if (!issue || Number.isNaN(issue)) throw new Error("Issue number required (--issue)");

  const token = requireGitHubToken();
  const repoFullName = inferRepoFullName(repo);

  const detailed = await fetchIssue({
    token,
    repoFullName,
    number: issue,
    includeBody: true,
    includeProjects: true
  });

  if (!write) {
    console.log(JSON.stringify(detailed, null, 2));
    return;
  }

  const outPath = out ?? defaultIssuesSnapshotPath(repoFullName);
  const snapshot = await loadSnapshot(outPath);
  const updated = await upsertIssueInSnapshot(snapshot, detailed);
  updated.repo = repoFullName;
  await writeJsonAtomic(outPath, updated);
  console.log(`Updated issue #${issue} in ${outPath}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
