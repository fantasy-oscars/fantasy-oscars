import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { GROUPS } from "../../../.github/scripts/affected.mjs";
import {
  CHANGED_E2E_SPECS,
  COMMANDS,
  INTENTIONAL_DIFFERENCES,
  changedE2eSpecs,
  plan
} from "../../../.github/scripts/ci-affected.mjs";

const WORKFLOW = readFileSync(
  new URL("../../../.github/workflows/ci.yml", import.meta.url),
  "utf8"
);

const indentOf = (line) => line.length - line.trimStart().length;

/**
 * Reads the `run` steps (with their `env`) of each job a group selects, from the plain
 * layout ci.yml uses: two-space job keys under `jobs:`, a job-level
 * `if: needs.changes.outputs.<group> == 'true'`, and `- name:`/`- uses:` step items.
 * @param {string} yaml
 * @returns {Map<string, Array<{ run: string; env: Record<string, string> }>>}
 */
function ciStepsByGroup(yaml) {
  const lines = yaml.split("\n");
  const byGroup = new Map();
  let group = null;
  let inJobs = false;
  let step = null;
  let envIndent = null;
  let blockIndent = null;

  const finishStep = () => {
    if (group && step?.run) {
      byGroup.set(group, [...(byGroup.get(group) ?? []), step]);
    }
    step = null;
    envIndent = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (blockIndent !== null) {
      if (trimmed === "" || indentOf(line) > blockIndent) {
        step.run = [step.run, trimmed].filter(Boolean).join("\n");
        continue;
      }
      blockIndent = null;
    }
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const indent = indentOf(line);
    if (indent === 0) {
      finishStep();
      inJobs = trimmed === "jobs:";
      group = null;
      continue;
    }
    if (!inJobs) continue;
    if (indent === 2) {
      finishStep();
      group = null;
      continue;
    }
    const jobIf = /^if: needs\.changes\.outputs\.(\w+) == 'true'$/.exec(trimmed);
    if (indent === 4 && jobIf) {
      group = jobIf[1];
      continue;
    }
    if (trimmed.startsWith("- ")) {
      finishStep();
      step = { run: "", env: {} };
    }
    if (!step) continue;
    const field = trimmed.replace(/^- /, "");
    if (envIndent !== null && indent > envIndent) {
      const pair = /^(\w+): (.+)$/.exec(field);
      if (pair) step.env[pair[1]] = pair[2].replace(/^["']|["']$/g, "");
      continue;
    }
    envIndent = null;
    if (field === "env:") {
      envIndent = indent;
    } else if (field === "run: |") {
      blockIndent = indent;
    } else if (field.startsWith("run: ")) {
      step.run = field.slice("run: ".length);
    }
  }
  finishStep();
  return byGroup;
}

const asCommand = ({ run, env }) => ({ run, env: env ?? {} });

/** Drops repeats (each CI job builds the shared package; locally it is built once). */
function distinct(commands) {
  const seen = new Set();
  return commands.filter((command) => {
    const key = JSON.stringify(command);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * @param {typeof COMMANDS} commands
 * @param {typeof INTENTIONAL_DIFFERENCES} differences
 * @param {ReturnType<typeof ciStepsByGroup>} ci
 * @returns {string[]} one line per mismatch; empty when local and CI agree
 */
function parityProblems(commands, differences, ci) {
  const problems = [];
  for (const group of Object.keys(commands)) {
    if (!GROUPS.includes(group)) problems.push(`COMMANDS names unknown group "${group}"`);
  }
  for (const group of GROUPS) {
    if (!commands[group]?.length) problems.push(`no local command for "${group}"`);
    if (!ci.get(group)?.length) problems.push(`no CI job runs for "${group}"`);
    const listed = differences.filter((d) => d.group === group);
    const ciOnly = new Set(listed.map((d) => d.ci).filter(Boolean));
    const localOnly = new Set(listed.map((d) => d.local).filter(Boolean));
    const expected = distinct(
      (ci.get(group) ?? []).filter((step) => !ciOnly.has(step.run)).map(asCommand)
    );
    const actual = distinct(
      (commands[group] ?? []).filter((c) => !localOnly.has(c.run)).map(asCommand)
    );
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      problems.push(
        `"${group}": local ${JSON.stringify(actual)} != CI ${JSON.stringify(expected)}; ` +
          "align them or list the difference in INTENTIONAL_DIFFERENCES"
      );
    }
  }
  for (const d of differences) {
    if (!d.reason?.trim()) problems.push(`difference without a reason in "${d.group}"`);
    if (Boolean(d.ci) === Boolean(d.local)) {
      problems.push(`a difference in "${d.group}" names neither or both sides`);
    } else if (d.ci && !(ci.get(d.group) ?? []).some((step) => step.run === d.ci)) {
      problems.push(`stale difference: CI no longer runs "${d.ci}" for "${d.group}"`);
    } else if (d.local && !(commands[d.group] ?? []).some((c) => c.run === d.local)) {
      problems.push(`stale difference: no local "${d.local}" for "${d.group}"`);
    }
  }
  return problems;
}

test("local commands match the CI jobs for every group, apart from the listed differences", () => {
  assert.deepEqual(
    parityProblems(COMMANDS, INTENTIONAL_DIFFERENCES, ciStepsByGroup(WORKFLOW)),
    []
  );
});

test("a group without local commands fails the parity check", () => {
  const withoutVisual = Object.fromEntries(
    Object.entries(COMMANDS).filter(([group]) => group !== "visual")
  );
  const problems = parityProblems(
    withoutVisual,
    INTENTIONAL_DIFFERENCES,
    ciStepsByGroup(WORKFLOW)
  );
  assert.equal(problems[0], 'no local command for "visual"');
});

test("an unlisted difference or a stale listing fails the parity check", () => {
  const ci = ciStepsByGroup(WORKFLOW);
  const fewerWorkers = {
    ...COMMANDS,
    visual: COMMANDS.visual.map((c) =>
      c.env ? { ...c, env: { VISUAL_WORKERS: "1" } } : c
    )
  };
  const problems = parityProblems(fewerWorkers, INTENTIONAL_DIFFERENCES, ci);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^"visual": local/);
  const stale = [
    ...INTENTIONAL_DIFFERENCES,
    { group: "api", ci: "pnpm run nothing", reason: "gone" }
  ];
  assert.deepEqual(parityProblems(COMMANDS, stale, ci), [
    'stale difference: CI no longer runs "pnpm run nothing" for "api"'
  ]);
});

test("the workflow reader finds steps, env and block runs", () => {
  const yaml = [
    "on: push",
    "jobs:",
    "  changes:",
    "    steps:",
    "      - run: node select.mjs",
    "  unit:",
    "    needs: changes",
    "    if: needs.changes.outputs.checks == 'true'",
    "    steps:",
    "      - uses: actions/checkout@v7",
    "      - name: Lint",
    "        run: pnpm run lint",
    "        env:",
    "          WORKERS: 4",
    "      - name: Both",
    "        run: |",
    "          one",
    "          two",
    "  gate:",
    "    steps:",
    "      - run: echo done"
  ].join("\n");
  assert.deepEqual(
    [...ciStepsByGroup(yaml)],
    [
      [
        "checks",
        [
          { run: "pnpm run lint", env: { WORKERS: "4" } },
          { run: "one\ntwo", env: {} }
        ]
      ]
    ]
  );
});

test("changed e2e specs are the present spec files under tests/e2e", () => {
  const present = new Set(["tests/e2e/a.spec.ts", "tests/e2e/nested/b.spec.ts"]);
  assert.deepEqual(
    changedE2eSpecs(
      [
        "tests/e2e/a.spec.ts",
        "tests/e2e/nested/b.spec.ts",
        "tests/e2e/deleted.spec.ts",
        "tests/e2e/support/helpers.ts",
        "tests/visual/screens.spec.ts"
      ],
      (path) => present.has(path)
    ),
    ["tests/e2e/a.spec.ts", "tests/e2e/nested/b.spec.ts"]
  );
});

test("the plan repeats changed e2e specs and skips the step when none changed", () => {
  const repeat = (steps) => steps.find((s) => s.argv.includes("--repeat-each=3"));
  const withSpecs = plan(["e2e"], ["tests/e2e/a.spec.ts"]);
  assert.deepEqual(repeat(withSpecs)?.argv, [
    "pnpm",
    "exec",
    "playwright",
    "test",
    "--repeat-each=3",
    "--retries=0",
    "--workers=1",
    "tests/e2e/a.spec.ts"
  ]);
  assert.equal(repeat(plan(["e2e"], [])), undefined);
  assert.ok(!withSpecs.some((s) => s.argv.includes(CHANGED_E2E_SPECS)));
});

test("the plan runs a shared command once and carries each step's env", () => {
  const steps = plan(["api", "visual", "e2e"], []);
  const labels = steps.map((s) => s.label);
  assert.equal(
    labels.filter((l) => l === "pnpm --filter @fantasy-oscars/shared build").length,
    1
  );
  assert.deepEqual(
    steps.filter((s) => s.argv[1] === "tests/visual/run.mjs").map((s) => s.env),
    [{ VISUAL_WORKERS: "4" }, { VISUAL_WORKERS: "4" }, { VISUAL_WORKERS: "6" }]
  );
  assert.ok(
    labels.includes("VISUAL_WORKERS=6 node tests/visual/run.mjs --tier assertions")
  );
});
