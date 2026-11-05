import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ALLOWLIST } from "./allowlist";

/** Each assertion test (one brand, viewport and screen half, both modes) leaves one of these; the run's teardown reads them all. */
export const RESULTS_DIR = "test-results/visual/assertions";

export type ResultFile = {
  brand: string;
  viewport: string;
  /** Indexes into ALLOWLIST that matched a finding in this test. */
  matched: number[];
  touchTargets: string[];
  /** Every finding, for triage (not used by the run). */
  findings: {
    screen: string;
    mode: string;
    check: string;
    description: string;
    allowlisted: boolean;
  }[];
};

export function clearResults() {
  rmSync(RESULTS_DIR, { recursive: true, force: true });
}

/**
 * Prints the touch-target report and fails on stale allowlist entries. Staleness is
 * only judged when every assertion test ran (a `-g` run sees a subset).
 */
export function reportResults(expectedTests: number) {
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

  if (results.length < expectedTests) return;
  const matched = new Set(results.flatMap((r) => r.matched));
  const stale = ALLOWLIST.map((entry, index) => ({ entry, index })).filter(
    ({ index }) => !matched.has(index)
  );
  if (stale.length > 0) {
    const lines = stale.map(
      ({ entry }) =>
        `  ${entry.check} ${[entry.screen].flat().join(",")} ${entry.brand}/${entry.mode}/${entry.viewport} ${entry.match ?? ""}`
    );
    throw new Error(
      `Stale allowlist entries (no longer failing; delete them from tests/visual/assertions/allowlist.ts):\n${lines.join("\n")}`
    );
  }
}
