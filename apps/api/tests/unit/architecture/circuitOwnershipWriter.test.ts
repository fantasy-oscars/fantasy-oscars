import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

// Ownership history has one writer (ADR 0005, section 7): the ownership
// service, which locks the member row and checks exclusivity, capacity and
// category limits. No other source file may call the repository writes or
// write the tables in SQL, so a new acquisition path cannot skip the checks.
const srcRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../src"
);
const WRITES = [
  "insertCircuitTransaction",
  "closeCircuitOwnership",
  "insertCircuitOwnership",
  "lockCircuitLeagueMember"
];
const SQL_WRITE =
  /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(public\.)?circuit_(ownership|transaction)\b/i;
const REPOSITORY = "data/repositories/circuitOwnershipRepository.ts";
const SERVICE = "services/circuit/circuitOwnership.ts";

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

const files = sourceFiles(srcRoot).map((file) =>
  path.relative(srcRoot, file).split(path.sep).join("/")
);
const read = (rel: string) => fs.readFileSync(path.join(srcRoot, rel), "utf8");

describe("Circuit ownership writer", () => {
  it("keeps the repository writes inside the ownership service", () => {
    const offenders = files
      .filter((rel) => rel !== REPOSITORY && rel !== SERVICE)
      .filter((rel) => WRITES.some((name) => read(rel).includes(name)));
    expect(offenders).toEqual([]);
  });

  it("writes the ownership tables in SQL only from the repository", () => {
    const offenders = files
      .filter((rel) => rel !== REPOSITORY)
      .filter((rel) => SQL_WRITE.test(read(rel)));
    expect(offenders).toEqual([]);
  });
});
