import { execFileSync, execSync } from "node:child_process";

const DEFAULT_REPO = "fantasy-oscars/fantasy-oscars";

export function requireGitHubToken() {
  try {
    execFileSync("gh", ["auth", "status", "-h", "github.com"], { stdio: "pipe" });
  } catch {
    throw new Error("gh auth is required (run `gh auth login`)");
  }
  return "gh";
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

  return DEFAULT_REPO;
}

export function splitRepoFullName(repoFullName) {
  const [owner, name] = repoFullName.split("/");
  if (!owner || !name) throw new Error(`Invalid repo: ${repoFullName} (expected owner/name)`);
  return { owner, name };
}

export async function githubGraphql(_token, query, variables = {}) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  if (variables && Object.keys(variables).length > 0) {
    for (const [key, value] of Object.entries(variables)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item === undefined) continue;
          if (typeof item === "string") {
            args.push("-F", `${key}=${item}`);
          } else {
            args.push("-F", `${key}=${JSON.stringify(item)}`);
          }
        }
        continue;
      }
      if (typeof value === "string") {
        args.push("-f", `${key}=${value}`);
      } else if (typeof value === "number" || typeof value === "boolean") {
        args.push("-F", `${key}=${String(value)}`);
      } else {
        args.push("-F", `${key}=${JSON.stringify(value)}`);
      }
    }
  }
  const output = execFileSync("gh", args, { encoding: "utf8" });
  const parsed = output ? JSON.parse(output) : {};
  if (parsed.errors?.length) {
    const message = parsed.errors.map((e) => e.message).join("; ");
    throw new Error(`GitHub GraphQL error: ${message}`);
  }
  return parsed.data ?? parsed;
}
