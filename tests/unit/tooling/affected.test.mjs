import assert from "node:assert/strict";
import test from "node:test";

import {
  GROUPS,
  TABLE,
  groupsForPath,
  selectGroups
} from "../../../.github/scripts/affected.mjs";

const EVERYTHING = [...GROUPS];

test("apps/api selects checks, api and e2e", () => {
  assert.deepEqual(selectGroups(["apps/api/src/routes/leagues.ts"]), [
    "checks",
    "api",
    "e2e"
  ]);
});

test("apps/web selects checks, web, visual and e2e", () => {
  assert.deepEqual(selectGroups(["apps/web/src/ui/Button.tsx"]), [
    "checks",
    "web",
    "visual",
    "e2e"
  ]);
});

test("docs alone selects only docs", () => {
  assert.deepEqual(selectGroups(["docs/adr/0004-x.md", "README.md"]), ["docs"]);
});

test("tests/visual selects checks and visual", () => {
  assert.deepEqual(selectGroups(["tests/visual/matrix.ts"]), ["checks", "visual"]);
  assert.deepEqual(selectGroups(["playwright.visual.config.ts"]), ["checks", "visual"]);
});

test("tests/e2e selects checks and e2e", () => {
  assert.deepEqual(selectGroups(["tests/e2e/web-smoke.spec.ts"]), ["checks", "e2e"]);
  assert.deepEqual(selectGroups(["playwright.config.ts"]), ["checks", "e2e"]);
});

test("tooling unit tests select checks", () => {
  assert.deepEqual(selectGroups(["tests/unit/tooling/affected.test.mjs"]), ["checks"]);
});

test("shared, database, workflows, root config and lockfile select everything", () => {
  for (const path of [
    "packages/shared/src/index.ts",
    "database/migrations/001_init.sql",
    ".github/workflows/ci.yml",
    ".github/scripts/affected.mjs",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "eslint.config.mjs",
    "infra/compose.yml",
    "tooling/x",
    ".nvmrc"
  ]) {
    assert.deepEqual(selectGroups([path]), EVERYTHING, path);
  }
});

test("an unmapped path selects everything", () => {
  assert.deepEqual(selectGroups(["some-new-top-level/file.txt"]), EVERYTHING);
  assert.deepEqual(groupsForPath("apps/mobile/src/a.ts"), EVERYTHING);
  assert.deepEqual(groupsForPath("apps/api"), EVERYTHING);
});

test("a path takes its first matching row", () => {
  assert.deepEqual(groupsForPath("docs/design/prescriptions/x.md"), ["docs"]);
  assert.deepEqual(groupsForPath("docs"), EVERYTHING);
});

test("a mixed diff is the union in canonical order", () => {
  assert.deepEqual(selectGroups(["docs/a.md", "apps/api/src/a.ts"]), [
    "checks",
    "api",
    "e2e",
    "docs"
  ]);
  assert.deepEqual(selectGroups(["apps/api/a.ts", "apps/web/b.tsx", "docs/c.md"]), [
    "checks",
    "api",
    "web",
    "visual",
    "e2e",
    "docs"
  ]);
});

test("an empty diff selects nothing", () => {
  assert.deepEqual(selectGroups([]), []);
});

test("every table row names known groups and has patterns", () => {
  for (const row of TABLE) {
    assert.ok(row.patterns.length > 0);
    for (const group of row.groups) assert.ok(GROUPS.includes(group), group);
  }
});
