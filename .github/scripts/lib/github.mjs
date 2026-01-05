import { execSync } from "node:child_process";

export function requireGitHubToken() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required");
  return token;
}

export function inferRepoFullName(repoArg) {
  if (repoArg) return repoArg;
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;

  try {
    const remote = execSync("git config --get remote.origin.url", { encoding: "utf8" }).trim();
    const match = remote.match(/[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
    if (match) return match[1];
  } catch {
    // ignore
  }

  throw new Error("Provide --repo owner/name or set GITHUB_REPOSITORY");
}

export function splitRepoFullName(repoFullName) {
  const [owner, name] = repoFullName.split("/");
  if (!owner || !name) throw new Error(`Invalid repo: ${repoFullName} (expected owner/name)`);
  return { owner, name };
}

export async function githubGraphql(token, query, variables = {}) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query, variables })
  });

  const data = await res.json();
  if (!res.ok || data.errors) {
    const message = data.errors?.map((e) => e.message).join("; ") ?? res.statusText;
    throw new Error(`GitHub GraphQL error: ${message}`);
  }
  return data.data;
}

