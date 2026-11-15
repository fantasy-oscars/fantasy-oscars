#!/usr/bin/env node
/**
 * Local counterpart of the CI selection: runs the commands for the groups the diff against
 * origin/main selects. `pnpm run ci` still runs everything and remains the definition of done.
 *
 * Usage: node .github/scripts/ci-affected.mjs [baseRef] [--dry-run]
 */

import { spawnSync } from "node:child_process";

import { changedPaths, selectGroups } from "./affected.mjs";

/** Local commands per group, in run order. Visual tiers run only in GitHub CI. */
const COMMANDS = {
  checks: ["test:format", "test:lint", "test:typecheck", "test:unit"],
  api: ["test:integration"],
  web: ["test:build", "bundle:check"],
  e2e: ["test:e2e"],
  docs: ["ci:docs"]
};

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const baseRef = args.find((arg) => !arg.startsWith("--")) ?? "origin/main";

const paths = changedPaths(baseRef);
const groups = selectGroups(paths);
console.log(
  `affected: ${groups.length ? groups.join(", ") : "none"} (${paths.length} changed paths vs ${baseRef})`
);

if (groups.includes("visual")) {
  console.log(
    "visual (tolerances, assertions, screenshots): runs in GitHub CI, not locally."
  );
}

const scripts = groups.flatMap((group) => COMMANDS[group] ?? []);
for (const script of scripts) {
  console.log(`\n> pnpm run ${script}`);
  if (dryRun) continue;
  const result = spawnSync("pnpm", ["run", script], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
