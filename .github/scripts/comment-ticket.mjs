#!/usr/bin/env node
/**
 * Post a comment to a GitHub issue.
 *
 * Usage:
 *   node .github/scripts/comment-ticket.mjs --issue 4 --body "Progress update"
 *   node .github/scripts/comment-ticket.mjs --issue 4 --body-file path/to/body.md
 *
 * Requirements:
 *   - GITHUB_TOKEN must be set with repo:issues scope.
 *   - Runs from inside the repo (for git remote lookup) unless --repo is provided.
 */
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";

function parseArgs(argv) {
  const args = { issue: undefined, body: undefined, bodyFile: undefined, repo: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--issue") {
      args.issue = Number(argv[++i]);
    } else if (arg === "--body") {
      args.body = argv[++i];
    } else if (arg === "--body-file") {
      args.bodyFile = argv[++i];
    } else if (arg === "--repo") {
      args.repo = argv[++i];
    }
  }
  return args;
}

function inferRepo() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  try {
    const remote = execSync("git config --get remote.origin.url", { encoding: "utf8" }).trim();
    // Examples:
    // https://github.com/owner/repo.git
    // git@github.com:owner/repo.git
    const match = remote.match(/[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
    if (match) return match[1];
  } catch {
    // ignore
  }
  return null;
}

async function getBody(body, bodyFile) {
  if (body) return body;
  if (bodyFile) {
    return readFile(bodyFile, "utf8");
  }
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  return null;
}

async function main() {
  const { issue, body, bodyFile, repo: repoArg } = parseArgs(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN is required");
  }
  if (!issue || Number.isNaN(issue)) {
    throw new Error("Issue number is required (use --issue <number>)");
  }

  const repo = repoArg ?? inferRepo();
  if (!repo) {
    throw new Error("Unable to infer repo; provide --repo owner/name");
  }

  const commentBody = await getBody(body, bodyFile);
  if (!commentBody) {
    throw new Error("Comment body is required (use --body, --body-file, or pipe stdin)");
  }

  const url = `https://api.github.com/repos/${repo}/issues/${issue}/comments`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Accept": "application/vnd.github+json"
    },
    body: JSON.stringify({ body: commentBody })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  // eslint-disable-next-line no-console
  console.log(`Comment created: ${data.html_url}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err.message);
  process.exit(1);
});
