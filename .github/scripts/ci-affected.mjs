#!/usr/bin/env node
/**
 * Local counterpart of the CI selection: runs, for the groups the diff against origin/main
 * selects, the same commands the GitHub CI jobs for those groups run. `pnpm run ci` still
 * runs everything except the visual tiers and remains the definition of done.
 *
 * Usage: node .github/scripts/ci-affected.mjs [baseRef] [--dry-run]
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { changedPaths, selectGroups } from "./affected.mjs";

/** Expands to the changed e2e spec files; a command using it is skipped when there are none. */
export const CHANGED_E2E_SPECS = "{changed-e2e-specs}";

/**
 * Runs each changed e2e spec three times with no retries. One worker, as in CI: the specs
 * share personas, so parallel copies of one spec collide.
 */
const REPEAT_CHANGED_SPECS = `pnpm exec playwright test --repeat-each=3 --retries=0 --workers=1 ${CHANGED_E2E_SPECS}`;

/**
 * Local commands per group, in run order. Each is the `run` step of a CI job the group
 * selects in .github/workflows/ci.yml, with that step's `env`, except where
 * INTENTIONAL_DIFFERENCES says otherwise. tests/unit/tooling/ci-parity.test.mjs holds the
 * two in step. A command shared by several groups runs once.
 * @type {Record<string, ReadonlyArray<{ run: string; env?: Record<string, string> }>>}
 */
export const COMMANDS = {
  checks: [
    { run: "pnpm run test:format" },
    { run: "pnpm run test:lint" },
    { run: "pnpm run test:typecheck" },
    { run: "pnpm run test:unit" }
  ],
  api: [
    { run: "pnpm --filter @fantasy-oscars/shared build" },
    { run: "pnpm run test:integration" }
  ],
  web: [{ run: "pnpm run test:build" }, { run: "pnpm run bundle:check" }],
  // Same worker counts as the CI jobs; see docs/standards/testing.md.
  visual: [
    { run: "pnpm --filter @fantasy-oscars/shared build" },
    {
      run: "node tests/visual/run.mjs --tier screenshots",
      env: { VISUAL_WORKERS: "4" }
    },
    { run: "node tests/visual/run.mjs --tier tolerances", env: { VISUAL_WORKERS: "4" } },
    { run: "node tests/visual/run.mjs --tier assertions", env: { VISUAL_WORKERS: "6" } }
  ],
  e2e: [
    { run: "pnpm --filter @fantasy-oscars/shared build" },
    { run: "pnpm run test:e2e" },
    { run: REPEAT_CHANGED_SPECS }
  ],
  docs: [{ run: "pnpm run ci:docs" }]
};

/**
 * Where the local commands knowingly differ from the CI jobs, one reason each. `ci` names
 * a CI step that has no local command; `local` a local command that has no CI step.
 * @type {ReadonlyArray<{ group: string; ci?: string; local?: string; reason: string }>}
 */
export const INTENTIONAL_DIFFERENCES = [
  {
    group: "e2e",
    ci: "pnpm exec playwright install --with-deps chromium",
    reason:
      "a fresh runner needs Chromium and its system libraries; a workstation installs the browser once (pnpm run test:e2e:install)"
  },
  {
    group: "e2e",
    local: REPEAT_CHANGED_SPECS,
    reason:
      "a changed spec that passes only some of the time should fail here, where CI's one retry would hide it"
  }
];

/**
 * @param {string[]} paths changed paths
 * @param {(path: string) => boolean} [exists]
 * @returns {string[]} e2e spec files changed and still present
 */
export function changedE2eSpecs(paths, exists = existsSync) {
  return paths.filter((p) => /^tests\/e2e\/.+\.spec\.ts$/.test(p) && exists(p));
}

/**
 * The distinct commands for the selected groups, in group then run order, as argv lists.
 * @param {readonly string[]} groups
 * @param {string[]} changedSpecs
 * @returns {Array<{ label: string; argv: string[]; env: Record<string, string> }>}
 */
export function plan(groups, changedSpecs) {
  const seen = new Set();
  const steps = [];
  for (const group of groups) {
    for (const command of COMMANDS[group] ?? []) {
      const env = command.env ?? {};
      const key = JSON.stringify([command.run, env]);
      if (seen.has(key)) continue;
      seen.add(key);
      const words = command.run.split(/\s+/);
      if (words.includes(CHANGED_E2E_SPECS) && changedSpecs.length === 0) continue;
      const argv = words.flatMap((word) =>
        word === CHANGED_E2E_SPECS ? changedSpecs : [word]
      );
      const prefix = Object.entries(env).map(([name, value]) => `${name}=${value} `);
      steps.push({ label: `${prefix.join("")}${argv.join(" ")}`, argv, env });
    }
  }
  return steps;
}

function main(args) {
  const dryRun = args.includes("--dry-run");
  const baseRef = args.find((arg) => !arg.startsWith("--")) ?? "origin/main";

  const paths = changedPaths(baseRef);
  const groups = selectGroups(paths);
  console.log(
    `affected: ${groups.length ? groups.join(", ") : "none"} (${paths.length} changed paths vs ${baseRef})`
  );

  for (const step of plan(groups, changedE2eSpecs(paths))) {
    console.log(`\n> ${step.label}`);
    if (dryRun) continue;
    const [command, ...rest] = step.argv;
    const result = spawnSync(command, rest, {
      stdio: "inherit",
      env: { ...process.env, ...step.env }
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
