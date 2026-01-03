import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { fileURLToPath } from "url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../../../db/migrations");

function getSortedMigrationFiles() {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

async function applyMigrations(pool: Pool) {
  for (const file of getSortedMigrationFiles()) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    await pool.query(sql);
  }
}

export async function startTestDatabase() {
  const container = await new PostgreSqlContainer().start();
  const pool = new Pool({ connectionString: container.getConnectionUri() });
  await applyMigrations(pool);

  async function stop() {
    await pool.end();
    await container.stop();
  }

  return { pool, stop };
}

export async function truncateAllTables(pool: Pool) {
  const { rows } = await pool.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'pg_%'
      AND tablename NOT LIKE 'sql_%'
  `);

  const tables = rows.map((r) => r.tablename);
  if (tables.length === 0) return;

  const joined = tables.map((t) => `"${t}"`).join(", ");
  await pool.query(`TRUNCATE ${joined} RESTART IDENTITY CASCADE;`);
}
