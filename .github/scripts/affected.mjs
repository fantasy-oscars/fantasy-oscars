#!/usr/bin/env node
/**
 * Chooses which CI groups a diff needs.
 *
 * Usage: node .github/scripts/affected.mjs [baseRef] [--github] [--all]
 * - baseRef defaults to origin/main; the diff is merge-base(baseRef, HEAD) against the
 *   working tree, plus untracked files.
 * - --github appends `group=true|false` lines to $GITHUB_OUTPUT.
 * - --all skips the diff and selects everything (pushes to main, merge queue).
 *
 * Groups:
 * - checks: format, lint, typecheck, unit tests (fast; runs for any code change)
 * - api: API integration tests
 * - web: web build and bundle budget
 * - visual: tolerance, assertion and screenshot tiers
 * - e2e: browser flows against the real API and database
 * - docs: documentation checks
 *
 * Fail safe: a path no row matches selects everything.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const GROUPS = ["checks", "api", "web", "visual", "e2e", "docs"];

/** Selects every group. */
const ALL = GROUPS;

/**
 * Declarative mapping. A path takes the first row whose pattern matches; rows are
 * ordered most specific first. `**` matches across directories, `*` within one.
 * @type {ReadonlyArray<{ patterns: string[]; groups: readonly string[]; why: string }>}
 */
export const TABLE = [
  {
    patterns: ["docs/**", "README.md"],
    groups: ["docs"],
    why: "documentation only"
  },
  {
    patterns: ["apps/api/**"],
    groups: ["checks", "api", "e2e"],
    why: "API code; e2e drives the real API"
  },
  {
    patterns: ["apps/web/**"],
    groups: ["checks", "web", "visual", "e2e"],
    why: "web code; e2e drives the real web app"
  },
  {
    patterns: ["tests/visual/**", "playwright.visual.config.ts"],
    groups: ["checks", "visual"],
    why: "visual suite"
  },
  {
    patterns: ["tests/e2e/**", "playwright.config.ts"],
    groups: ["checks", "e2e"],
    why: "e2e suite"
  },
  {
    patterns: ["tests/unit/**"],
    groups: ["checks"],
    why: "tooling unit tests"
  },
  {
    patterns: [
      "packages/**",
      "database/**",
      ".github/**",
      "infra/**",
      "tooling/**",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "eslint.config.mjs",
      ".npmrc",
      ".nvmrc",
      ".prettierrc.json",
      ".prettierignore",
      ".editorconfig",
      ".markdownlint.json",
      ".dockerignore",
      ".gitignore"
    ],
    groups: ALL,
    why: "shared package, schema, workflows and root config affect everything"
  }
];

/**
 * @param {string} pattern
 * @returns {RegExp}
 */
function globToRegExp(pattern) {
  let source = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        source += ".*";
        i += 1;
        if (pattern[i + 1] === "/") i += 1;
      } else {
        source += "[^/]*";
      }
    } else {
      source += char.replace(/[.+^${}()|[\]\\?]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

const COMPILED = TABLE.map((row) => ({
  ...row,
  matchers: row.patterns.map(globToRegExp)
}));

/**
 * @param {string} path repo-relative, forward slashes
 * @returns {readonly string[]} groups for the first matching row; all groups if unmapped
 */
export function groupsForPath(path) {
  const row = COMPILED.find((candidate) =>
    candidate.matchers.some((matcher) => matcher.test(path))
  );
  return row ? row.groups : ALL;
}

/**
 * @param {string[]} paths changed paths
 * @returns {string[]} selected groups in canonical order (empty for an empty diff)
 */
export function selectGroups(paths) {
  const selected = new Set();
  for (const path of paths) {
    for (const group of groupsForPath(path)) selected.add(group);
  }
  return GROUPS.filter((group) => selected.has(group));
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * @param {string} baseRef
 * @returns {string[]}
 */
export function changedPaths(baseRef) {
  const base = git(["merge-base", baseRef, "HEAD"])[0];
  const tracked = git(["diff", "--name-only", "--no-renames", base]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return [...new Set([...tracked, ...untracked])];
}

function main(argv) {
  const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
  const baseRef = argv.find((arg) => !arg.startsWith("--")) ?? "origin/main";
  const paths = flags.has("--all") ? null : changedPaths(baseRef);
  const selected = paths === null ? [...GROUPS] : selectGroups(paths);

  console.log(
    paths === null
      ? "affected: all (forced)"
      : `affected: ${selected.length ? selected.join(", ") : "none"} (${paths.length} changed paths vs ${baseRef})`
  );

  if (flags.has("--github")) {
    const out = process.env.GITHUB_OUTPUT;
    if (!out) {
      console.error("--github needs GITHUB_OUTPUT");
      process.exit(1);
    }
    appendFileSync(
      out,
      GROUPS.map((group) => `${group}=${selected.includes(group)}\n`).join("")
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
