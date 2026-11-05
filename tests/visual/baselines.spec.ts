import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { allCaptures } from "./matrix";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "__screenshots__");

function baselinesOnDisk(): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".png"))
    .map((entry) =>
      path
        .relative(root, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join("/")
    );
}

// Orphans cannot accumulate: every baseline is named by a capture, and every capture has one.
test("baselines on disk are exactly the captures the matrix names", () => {
  const referenced = new Set(allCaptures().map((c) => c.snapshot.join("/")));
  const onDisk = new Set(baselinesOnDisk());
  const orphans = [...onDisk].filter((file) => !referenced.has(file)).sort();
  const missing = [...referenced].filter((file) => !onDisk.has(file)).sort();
  expect(orphans, "baselines no capture references (delete them)").toEqual([]);
  expect(missing, "captures without a baseline (run test:visual:update)").toEqual([]);
});
