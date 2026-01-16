#!/usr/bin/env node
/**
 * Link tickets into a linear GitHub Issue Dependencies chain based on each issue's `## Next` section.
 *
 * This sets: nextIssue "blocked by" currentIssue
 *
 * Usage:
 *   npm run ticket:link-linear -- --snapshot .dev/github-issues/<owner>_<repo>.json --repo owner/name
 *   npm run ticket:link-linear -- --snapshot .dev/github-issues/<owner>_<repo>.json --repo owner/name --apply
 *
 * Notes:
 * - Reads from a local snapshot so we can compute the graph without repeated API calls.
 * - Only mutates GitHub when --apply is provided.
 */

import fs from "node:fs";
import { requireGitHubToken, inferRepoFullName } from "./lib/github.mjs";
import { addBlockedBy, listBlockedBy } from "./lib/issue-dependencies.mjs";

function parseArgs(argv) {
  const args = { repo: undefined, snapshot: undefined, apply: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--repo") args.repo = argv[++i];
    else if (arg === "--snapshot") args.snapshot = argv[++i];
    else if (arg === "--apply") args.apply = true;
  }
  return args;
}

function parseIndexIdFromIssue(issue) {
  const title = issue.title ?? "";
  const m = title.match(/^(MVP-\d+|P\d+-\d+)\b/);
  return m?.[1] ?? null;
}

function findMarkdownSection(body, heading) {
  if (!body) return null;
  const lines = body.split(/\r?\n/);
  const target = heading.toLowerCase();
  let start = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const m = line.match(/^#{2,6}\s+(.*)$/);
    if (!m) continue;
    const title = m[1].trim().toLowerCase();
    if (title === target) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return null;

  const out = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().match(/^#{2,6}\s+/)) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

function parseNextIndexId(body) {
  const section = findMarkdownSection(body ?? "", "next");
  if (!section) return null;
  const token = section.split(/\s+/).map((s) => s.trim()).find(Boolean);
  if (!token) return null;
  const m = token.match(/^(MVP-\d+|P\d+-\d+)$/);
  return m?.[1] ?? null;
}

async function main() {
  const { repo, snapshot, apply } = parseArgs(process.argv.slice(2));
  if (!snapshot) throw new Error("--snapshot <path> is required");

  const token = requireGitHubToken();
  const repoFullName = inferRepoFullName(repo);

  const raw = JSON.parse(fs.readFileSync(snapshot, "utf8"));
  const issues = raw.issues ?? raw;
  if (!Array.isArray(issues)) throw new Error("Snapshot must be an issues array or { issues: [...] }");

  const openIssues = issues.filter((i) => (i.state ?? "OPEN").toUpperCase() === "OPEN");

  const indexToIssueNumber = new Map();
  for (const issue of openIssues) {
    const indexId = parseIndexIdFromIssue(issue);
    if (!indexId) continue;
    indexToIssueNumber.set(indexId, issue.number);
  }

  const edges = [];
  const missingNext = [];

  for (const issue of openIssues) {
    const currentIndexId = parseIndexIdFromIssue(issue);
    if (!currentIndexId) continue;
    const nextIndexId = parseNextIndexId(issue.body ?? "");
    if (!nextIndexId) continue;

    const nextIssueNumber = indexToIssueNumber.get(nextIndexId);
    if (!nextIssueNumber) {
      missingNext.push({ issue: issue.number, currentIndexId, nextIndexId });
      continue;
    }

    edges.push({
      from: issue.number,
      fromIndexId: currentIndexId,
      to: nextIssueNumber,
      toIndexId: nextIndexId
    });
  }

  edges.sort((a, b) => a.from - b.from);

  console.log(
    JSON.stringify(
      {
        repo: repoFullName,
        mode: apply ? "apply" : "dry-run",
        openIssues: openIssues.length,
        plannedLinks: edges.length,
        missingNext: missingNext.length,
        sample: edges.slice(0, 10)
      },
      null,
      2
    )
  );

  if (missingNext.length) {
    console.log("Missing Next targets:");
    for (const m of missingNext.slice(0, 20)) {
      console.log(`- #${m.issue} (${m.currentIndexId}) -> ${m.nextIndexId} (not found in snapshot)`);
    }
    if (missingNext.length > 20) console.log(`...and ${missingNext.length - 20} more`);
  }

  if (!apply) return;

  let added = 0;
  for (const e of edges) {
    const existing = new Set(await listBlockedBy(token, { repo: repoFullName, issue: e.to }));
    if (existing.has(e.from)) continue;
    await addBlockedBy(token, { repo: repoFullName, issue: e.to, blockedBy: e.from });
    added++;
  }

  console.log(`Added ${added} blocked-by links.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

