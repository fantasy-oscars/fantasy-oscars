import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ALLOWLIST } from "./allowlist";
import {
  buildRegistry,
  loadRegistry,
  observedKey,
  observedUncheckedKey,
  REGENERATE_COMMAND,
  REGISTRY_PATH,
  registryKeys,
  saveRegistry,
  type ObservedPair,
  type ObservedUnchecked
} from "./pairs";

/** Each sweep cell (one viewport and a slice of the screens) leaves one of these; the run's teardown reads them all. */
export const RESULTS_DIR = "test-results/visual/assertions";

/** Set by `run.mjs --update`: the teardown rewrites the pair registry instead of judging drift. */
export const UPDATE_PAIRS = process.env.VISUAL_UPDATE_PAIRS === "1";

export type ResultFile = {
  viewport: string;
  part: number;
  /** Indexes into ALLOWLIST that matched a finding in this cell. */
  matched: number[];
  touchTargets: string[];
  /** Every layout finding, for triage (not used by the run). */
  findings: {
    screen: string;
    check: string;
    description: string;
    allowlisted: boolean;
  }[];
  pairs: ObservedPair[];
  unchecked: ObservedUnchecked[];
  /** Milliseconds per screen: load and paint, layout checks, pair recording in every mode. */
  timings: { screen: string; load: number; layout: number; record: number }[];
  failures: string[];
};

export function clearResults() {
  rmSync(RESULTS_DIR, { recursive: true, force: true });
}

/**
 * Prints the touch-target report, then, when every sweep cell ran (a `-g` run sees a
 * subset), fails on stale allowlist entries and on registry pairs no screen uses any
 * more, or rewrites the registry when asked to.
 */
export function reportResults(expectedCells: number) {
  if (!existsSync(RESULTS_DIR)) return;
  const results = readdirSync(RESULTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map(
      (f) => JSON.parse(readFileSync(path.join(RESULTS_DIR, f), "utf8")) as ResultFile
    );

  const touch = new Map<string, number>();
  for (const result of results) {
    for (const line of result.touchTargets) {
      touch.set(line, (touch.get(line) ?? 0) + 1);
    }
  }
  const lines = [...touch].sort().map(([line, count]) => `${line} (x${count})`);
  writeFileSync(path.join(RESULTS_DIR, "touch-targets.txt"), `${lines.join("\n")}\n`);
  if (touch.size > 0) {
    const open = lines.filter((line) => !line.includes("(allowlisted)"));
    console.log(
      `\nTouch targets under 44x44 at 390px: ${touch.size} distinct, ${open.length} not allowlisted. Full list: ${RESULTS_DIR}/touch-targets.txt`
    );
    for (const line of open.slice(0, 40)) console.log(`  ${line}`);
  }

  if (results.length < expectedCells) {
    if (UPDATE_PAIRS && results.length > 0) {
      throw new Error(
        `The pair registry is rebuilt only from a complete sweep (${results.length} of ${expectedCells} cells ran); run ${REGENERATE_COMMAND} without -g.`
      );
    }
    return;
  }

  const pairs = results.flatMap((r) => r.pairs);
  const unchecked = results.flatMap((r) => r.unchecked);
  if (UPDATE_PAIRS) {
    const registry = buildRegistry(pairs, unchecked);
    saveRegistry(registry);
    console.log(
      `\nWrote ${REGISTRY_PATH}: ${registry.pairs.length} pairs, ${registry.unchecked.length} unchecked. Review the diff like a baseline.`
    );
  } else {
    const seen = new Set([
      ...pairs.map(observedKey),
      ...unchecked.map(observedUncheckedKey)
    ]);
    const stale = [...registryKeys(loadRegistry())].filter((key) => !seen.has(key));
    if (stale.length > 0) {
      throw new Error(
        `${stale.length} pair registry entries are no longer used by any screen; regenerate ${REGISTRY_PATH} with ${REGENERATE_COMMAND}:\n${stale
          .slice(0, 25)
          .map((key) => `  ${key}`)
          .join("\n")}`
      );
    }
  }

  const matched = new Set(results.flatMap((r) => r.matched));
  const staleEntries = ALLOWLIST.map((entry, index) => ({ entry, index })).filter(
    ({ index }) => !matched.has(index)
  );
  if (staleEntries.length > 0) {
    const lines = staleEntries.map(
      ({ entry }) =>
        `  ${entry.check} ${[entry.screen].flat().join(",")} ${entry.viewport} ${entry.match ?? ""}`
    );
    throw new Error(
      `Stale allowlist entries (no longer failing; delete them from tests/visual/assertions/allowlist.ts):\n${lines.join("\n")}`
    );
  }
}
