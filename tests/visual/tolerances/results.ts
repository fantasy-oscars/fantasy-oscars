import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { TOLERANCE_ALLOWLIST } from "./allowlist";

/** Each tolerance test (one brand and viewport, both modes) leaves one of these; teardown reads them all. */
export const TOLERANCE_RESULTS_DIR = "test-results/visual/tolerance-results";

export type ToleranceResult = {
  brand: string;
  viewport: string;
  /** Indexes into TOLERANCE_ALLOWLIST that matched a failure in this test. */
  matched: number[];
  /** Every failure, allowlisted or not, for triage. */
  failures: { message: string; allowlisted: boolean }[];
};

export function clearToleranceResults() {
  rmSync(TOLERANCE_RESULTS_DIR, { recursive: true, force: true });
}

export function writeToleranceResult(name: string, result: ToleranceResult) {
  mkdirSync(TOLERANCE_RESULTS_DIR, { recursive: true });
  writeFileSync(path.join(TOLERANCE_RESULTS_DIR, `${name}.json`), JSON.stringify(result));
}

/**
 * Fails on allowlist entries that no finding matched. Judged only when every tolerance
 * test ran (a `-g` run sees a subset).
 */
export function reportToleranceResults(expectedTests: number) {
  if (!existsSync(TOLERANCE_RESULTS_DIR)) return;
  const results = readdirSync(TOLERANCE_RESULTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map(
      (f) =>
        JSON.parse(
          readFileSync(path.join(TOLERANCE_RESULTS_DIR, f), "utf8")
        ) as ToleranceResult
    );
  if (results.length < expectedTests) return;
  const matched = new Set(results.flatMap((r) => r.matched));
  const stale = TOLERANCE_ALLOWLIST.map((entry, index) => ({ entry, index })).filter(
    ({ index }) => !matched.has(index)
  );
  if (stale.length > 0) {
    const lines = stale.map(
      ({ entry }) =>
        `  ${entry.hook}${entry.states ? `:${entry.states.join("|")}` : ""} ${entry.prop} ${Object.keys(entry.pins).join(",")} (${entry.followUp})`
    );
    throw new Error(
      `Stale tolerance allowlist entries (no longer failing; delete them from tests/visual/tolerances/allowlist.ts):\n${lines.join("\n")}`
    );
  }
}
