import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  createRun,
  linkLatest,
  listRuns,
  pruneRuns,
  runHasNotes
} from "../../tour/support/run-dirs.mjs";

const scratch = () => mkdtempSync(path.join(tmpdir(), "tour-runs-"));
const addRun = (root, name, notes) => {
  const dir = path.join(root, name);
  mkdirSync(dir);
  if (notes) writeFileSync(path.join(dir, "notes.json"), JSON.stringify(notes));
  return dir;
};

test("createRun names the directory by the minute and never reuses one", () => {
  const root = scratch();
  const at = new Date(2026, 10, 24, 9, 5);
  assert.equal(path.basename(createRun(root, at)), "2026-11-24-0905");
  assert.equal(path.basename(createRun(root, at)), "2026-11-24-0905-2");
  assert.deepEqual(listRuns(root), ["2026-11-24-0905", "2026-11-24-0905-2"]);
});

test("linkLatest points at the run and moves on the next one", () => {
  const root = scratch();
  const first = addRun(root, "2026-11-24-0900");
  const second = addRun(root, "2026-11-24-1000");
  linkLatest(first);
  assert.equal(readlinkSync(path.join(root, "latest")), "2026-11-24-0900");
  linkLatest(second);
  assert.equal(readlinkSync(path.join(root, "latest")), "2026-11-24-1000");
  assert.deepEqual(listRuns(root), ["2026-11-24-0900", "2026-11-24-1000"]);
});

test("runHasNotes is false without a usable notes file", () => {
  const root = scratch();
  assert.equal(runHasNotes(addRun(root, "2026-11-24-0900")), false);
  assert.equal(runHasNotes(addRun(root, "2026-11-24-0901", { "001-a.png": " " })), false);
  assert.equal(runHasNotes(addRun(root, "2026-11-24-0902", { "001-a.png": "x" })), true);
});

test("pruneRuns keeps the newest three and a noted older run", () => {
  const root = scratch();
  addRun(root, "2026-11-20-0900", { "001-a.png": "fix this" });
  addRun(root, "2026-11-21-0900");
  addRun(root, "2026-11-22-0900");
  addRun(root, "2026-11-23-0900");
  addRun(root, "2026-11-24-0900");
  assert.deepEqual(pruneRuns(root), ["2026-11-21-0900"]);
  assert.deepEqual(listRuns(root), [
    "2026-11-20-0900",
    "2026-11-22-0900",
    "2026-11-23-0900",
    "2026-11-24-0900"
  ]);
  assert.equal(existsSync(path.join(root, "2026-11-21-0900")), false);
});
