import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../../db/migrations");

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

async function ensureHistoryTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migration_history (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function hasTable(pool, tableName) {
  const { rows } = await pool.query(
    `SELECT to_regclass($1) AS oid`,
    [`public.${tableName}`]
  );
  return Boolean(rows[0]?.oid);
}

async function seedHistory(pool, files) {
  for (const file of files) {
    await pool.query(
      `INSERT INTO migration_history (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
      [file]
    );
  }
}

async function listApplied(pool) {
  const { rows } = await pool.query(`SELECT filename FROM migration_history`);
  return new Set(rows.map((r) => r.filename));
}

async function applyMigrations(pool, files) {
  await ensureHistoryTable(pool);
  let applied = await listApplied(pool);
  if (applied.size === 0 && (await hasTable(pool, "icon"))) {
    // Existing schema without recorded migration history; backfill history to avoid reapplying.
    await seedHistory(pool, files);
    applied = await listApplied(pool);
    // eslint-disable-next-line no-console
    console.log("Seeded migration_history based on existing schema.");
  }
  let appliedCount = 0;

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(`INSERT INTO migration_history (filename) VALUES ($1)`, [file]);
      await client.query("COMMIT");
      // eslint-disable-next-line no-console
      console.log(`Applied migration: ${file}`);
      appliedCount += 1;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // eslint-disable-next-line no-console
  console.log(appliedCount === 0 ? "No migrations to apply." : `Applied ${appliedCount} migration(s).`);
}

async function main() {
  const urlArgIndex = process.argv.indexOf("--url");
  const url = urlArgIndex !== -1 ? process.argv[urlArgIndex + 1] : process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required (env or --url).");
  }

  const pool = new Pool({ connectionString: url });
  try {
    const files = getSortedMigrationFiles();
    if (files.length === 0) {
      // eslint-disable-next-line no-console
      console.log("No migration files found.");
      return;
    }
    await applyMigrations(pool, files);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
