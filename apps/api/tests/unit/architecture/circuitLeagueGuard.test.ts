import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

// Membership and enabled events freeze at initialisation through one guard
// (ADR 0005, section 4). The repository functions that write them may only be
// called from the service that locks the league and calls the guard, so a new
// route cannot skip it.
const srcRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../src"
);
const GUARDED_WRITES = [
  "insertCircuitLeagueMember",
  "deleteCircuitLeagueMember",
  "replaceCircuitLeagueEvents",
  "markCircuitLeagueInitialized"
];
const ALLOWED = new Set([
  "data/repositories/circuitLeagueRepository.ts",
  "services/circuit/circuitLeagues.ts"
]);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

describe("Circuit league guard", () => {
  it("keeps member and event writes inside the guarded service", () => {
    const offenders = sourceFiles(srcRoot)
      .map((file) => path.relative(srcRoot, file).split(path.sep).join("/"))
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) => {
        const text = fs.readFileSync(path.join(srcRoot, rel), "utf8");
        return GUARDED_WRITES.some((name) => text.includes(name));
      });
    expect(offenders).toEqual([]);
  });
});
