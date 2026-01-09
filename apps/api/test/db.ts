import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { fileURLToPath } from "url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../../../db/migrations");
const postgresImage = "postgres:16";

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
  // Ensure docker host is set for environments that have Docker available but DOCKER_HOST unset.
  if (!process.env.DOCKER_HOST) {
    const candidates = ["/var/run/docker.sock", "/run/docker.sock"];
    const socket = candidates.find((p) => fs.existsSync(p));
    if (socket) {
      process.env.DOCKER_HOST = `unix://${socket}`;
    }
  }

  const container = await new PostgreSqlContainer(postgresImage).start();
  const connectionString = container.getConnectionUri();
  const pool = new Pool({ connectionString });
  await applyMigrations(pool);

  async function stop() {
    await pool.end();
    await container.stop();
  }

  return { pool, stop, connectionString };
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
