import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../../database/migrations");

function loadMigrations() {
  if (!fs.existsSync(migrationsDir)) return [];

  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

test("migration filenames are zero-padded, unique, and strictly increasing", () => {
  const migrations = loadMigrations();
  assert.ok(migrations.length > 0, "No migrations found in database/migrations");

  const seen = new Set();
  let previous = -1;

  for (const file of migrations) {
    const match = /^(\d{3})_.*\.sql$/.exec(file);
    assert.ok(
      match,
      `Invalid migration filename "${file}". Expected NNN_description.sql with zero-padded number.`,
    );

    const number = Number.parseInt(match[1], 10);
    assert.ok(
      number > previous,
      `Migration "${file}" is not strictly increasing after ${previous
        .toString()
        .padStart(3, "0")}.`,
    );
    assert.ok(
      !seen.has(number),
      `Duplicate migration number ${number.toString().padStart(3, "0")} found at "${file}".`,
    );

    seen.add(number);
    previous = number;
  }
});
