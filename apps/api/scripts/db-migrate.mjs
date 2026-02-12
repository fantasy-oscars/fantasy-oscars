import "dotenv/config";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../../../database/migrations");

function parseMigrationFile(file) {
  const match = /^(\d{3})_.*\.sql$/.exec(file);
  if (!match) {
    throw new Error(
      `Invalid migration filename "${file}". Expected NNN_description.sql with zero-padded number.`
    );
  }
  return { file, number: Number.parseInt(match[1], 10) };
}

function getSortedMigrationFiles() {
  if (!fs.existsSync(migrationsDir)) return [];
  const migrations = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .map(parseMigrationFile)
    .sort((a, b) => a.number - b.number || a.file.localeCompare(b.file));

  const seen = new Set();
  for (const m of migrations) {
    if (seen.has(m.number)) {
      const dupes = migrations.filter((x) => x.number === m.number).map((x) => x.file);
      throw new Error(
        `Duplicate migration number ${m.number.toString().padStart(3, "0")}: ${dupes.join(", ")}`
      );
    }
    seen.add(m.number);
  }

  return migrations.map((m) => m.file);
}

async function ensureHistoryTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS migration_history (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function listApplied(db) {
  const { rows } = await db.query(`SELECT filename FROM migration_history`);
  return new Set(rows.map((r) => r.filename));
}

function isBootstrapSafeAlreadyAppliedError(err) {
  // When migrating an existing DB that predates `migration_history`, rerunning
  // old migrations can fail with "already exists". In that case, we treat the
  // migration as already applied and record it, so we can proceed to later
  // migrations that *do* need to run (e.g. new columns).
  const code = err && typeof err === "object" ? err.code : undefined;
  return (
    code === "42P07" || // duplicate_table / relation exists
    code === "42701" || // duplicate_column
    code === "42710" || // duplicate_object (index/constraint/etc)
    code === "42P06" || // duplicate_schema
    code === "23505" // unique_violation (seed data already present)
  );
}

async function applyMigrations(pool, files, { bootstrapExisting = false } = {}) {
  // Prevent multiple app instances from attempting migrations concurrently.
  const lockId = 447_249_109;

  const client = await pool.connect();
  try {
    await client.query(`SELECT pg_advisory_lock($1)`, [lockId]);
    await ensureHistoryTable(client);
    const applied = await listApplied(client);
    const bootstrapMode = bootstrapExisting && applied.size === 0;
    let appliedCount = 0;

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");

      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(`INSERT INTO migration_history (filename) VALUES ($1)`, [
          file
        ]);
        await client.query("COMMIT");
        console.log(`Applied migration: ${file}`);
        appliedCount += 1;
      } catch (err) {
        await client.query("ROLLBACK");
        if (bootstrapMode && isBootstrapSafeAlreadyAppliedError(err)) {
          // Mark it applied and continue; this lets us reach later migrations that
          // may actually be missing on the existing database.
          await client.query(
            `INSERT INTO migration_history (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
            [file]
          );
          console.log(
            `Marked migration as already applied (bootstrap): ${file} (code=${String(err.code)})`
          );
          continue;
        }
        throw err;
      }
    }

    console.log(
      appliedCount === 0
        ? "No migrations to apply."
        : `Applied ${appliedCount} migration(s).`
    );
  } finally {
    try {
      await client.query(`SELECT pg_advisory_unlock($1)`, [lockId]);
    } finally {
      client.release();
    }
  }
}

async function main() {
  const urlArgIndex = process.argv.indexOf("--url");
  const url =
    urlArgIndex !== -1 ? process.argv[urlArgIndex + 1] : process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required (env or --url).");
  }

  const bootstrapExisting =
    process.argv.includes("--bootstrap-existing") ||
    process.env.MIGRATIONS_BOOTSTRAP_EXISTING === "1";

  const pool = new Pool({ connectionString: url });
  try {
    const files = getSortedMigrationFiles();
    if (files.length === 0) {
      console.log("No migration files found.");
      return;
    }
    await applyMigrations(pool, files, { bootstrapExisting });
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
