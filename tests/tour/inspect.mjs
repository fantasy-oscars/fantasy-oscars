#!/usr/bin/env node
// Opens the tour inspector on a run (default: latest): the shots one at a time, a note
// on any of them, and Finish to write notes.md. Usage: node tests/tour/inspect.mjs [run]
// Port: TOUR_INSPECT_PORT (default 4400).
import path from "node:path";
import { listRuns, outputOverride, resolveRun } from "./support/run-dirs.mjs";
import { startInspector } from "./support/inspector-server.mjs";
import { previousRun } from "./support/runs.mjs";

const arg = process.argv[2];
let runDir;
try {
  runDir = resolveRun(arg);
} catch {
  console.error(`No tour run${arg ? ` named ${arg}` : ""}; run the tour first.`);
  process.exit(1);
}

const runName = path.basename(runDir);
// With TOUR_OUTPUT_DIR the run is outside the runs directory, so it has no earlier run.
const before = outputOverride() ? null : previousRun(listRuns(), runName);
const previous = before ? { name: before, dir: resolveRun(before) } : null;

const port = Number(process.env.TOUR_INSPECT_PORT || 4400);
try {
  const inspector = await startInspector({ runName, runDir, previous, port });
  console.log(`Tour inspector on run ${runName}: http://localhost:${inspector.port}`);
  console.log(
    previous ? `Compare (c) with ${previous.name}.` : "No earlier run to compare."
  );
  console.log("Ctrl+C to stop.");
} catch (error) {
  console.error(
    error?.code === "EADDRINUSE"
      ? `Port ${port} is in use; set TOUR_INSPECT_PORT to another.`
      : String(error)
  );
  process.exit(1);
}
