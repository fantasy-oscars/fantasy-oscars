// File-system side of tour runs: where they live, the `latest` link and pruning. The
// decisions themselves are in runs.mjs.
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasNotes, pruneChoice, runStamp, sortRuns, uniqueRunName } from "./runs.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const RUNS_DIR = path.join(repoRoot, "tests/tour/runs");
export const LATEST = "latest";

/** The explicit output directory, when TOUR_OUTPUT_DIR is set; runs are not managed then. */
export function outputOverride() {
  return process.env.TOUR_OUTPUT_DIR || null;
}

export function listRuns(runsDir = RUNS_DIR) {
  return existsSync(runsDir) ? sortRuns(readdirSync(runsDir)) : [];
}

/** Creates the next run directory (named by the minute) and returns its path. */
export function createRun(runsDir = RUNS_DIR, now = new Date()) {
  mkdirSync(runsDir, { recursive: true });
  const name = uniqueRunName(runStamp(now), readdirSync(runsDir));
  const dir = path.join(runsDir, name);
  mkdirSync(dir);
  return dir;
}

/** Points `latest` at a run, replacing an earlier link. */
export function linkLatest(runDir) {
  const link = path.join(path.dirname(runDir), LATEST);
  if (existsSync(link) || isLink(link)) unlinkSync(link);
  symlinkSync(path.basename(runDir), link, "dir");
}

function isLink(file) {
  try {
    return lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
}

/** True when the run has a notes.json with any note in it. */
export function runHasNotes(runDir) {
  try {
    return hasNotes(JSON.parse(readFileSync(path.join(runDir, "notes.json"), "utf8")));
  } catch {
    return false;
  }
}

/** Deletes all but the newest runs, never one with notes. Returns the names removed. */
export function pruneRuns(runsDir = RUNS_DIR, keep = 3) {
  const names = listRuns(runsDir);
  const noted = names.filter((n) => runHasNotes(path.join(runsDir, n)));
  const { remove } = pruneChoice(names, noted, keep);
  for (const name of remove) rmSync(path.join(runsDir, name), { recursive: true });
  return remove;
}

/**
 * The directory of a run: the override when set, else `run` (default `latest`) inside
 * the runs directory. Symlinks are resolved.
 */
export function resolveRun(run = LATEST, runsDir = RUNS_DIR) {
  const override = outputOverride();
  return realpathSync(override ?? path.join(runsDir, run));
}
