import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { fileURLToPath } from "url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../../../database/migrations");
const postgresImage = "postgres:16";

type MigrationFile = {
  file: string;
  number: number;
};

function parseMigrationFile(file: string): MigrationFile {
  const match = /^(\d{3})_.*\.sql$/.exec(file);
  if (!match) {
    throw new Error(
      `Invalid migration filename "${file}". Expected NNN_description.sql with zero-padded number.`
    );
  }
  return { file, number: Number.parseInt(match[1]!, 10) };
}

function getSortedMigrationFiles() {
  if (!fs.existsSync(migrationsDir)) return [];
  const migrations = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .map(parseMigrationFile)
    .sort((a, b) => a.number - b.number || a.file.localeCompare(b.file));

  const seen = new Set<number>();
  for (const migration of migrations) {
    if (seen.has(migration.number)) {
      const duplicates = migrations
        .filter((m) => m.number === migration.number)
        .map((m) => m.file)
        .join(", ");
      throw new Error(
        `Duplicate migration number ${migration.number
          .toString()
          .padStart(3, "0")}: ${duplicates}`
      );
    }
    seen.add(migration.number);
  }

  return migrations.map((m) => m.file);
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
