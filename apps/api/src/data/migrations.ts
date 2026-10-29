import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { Pool } from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Same relative path from `src/data` (tsx) and `dist/data` (compiled); override for packaged images. */
export function resolveMigrationsDir(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.MIGRATIONS_DIR?.trim() || path.resolve(here, "../../../../database/migrations")
  );
}

export function listExpectedMigrations(dir = resolveMigrationsDir()): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

export type MigrationStatus = {
  /** Latest applied migration filename, or null when none are recorded. */
  applied: string | null;
  /** Latest migration filename shipped with this build. */
  expected: string | null;
  /** Shipped migrations that have not been applied. */
  pending: string[];
};

export async function getMigrationStatus(
  pool: Pick<Pool, "query">,
  expectedFiles = listExpectedMigrations()
): Promise<MigrationStatus> {
  const expected =
    expectedFiles.length > 0 ? expectedFiles[expectedFiles.length - 1] : null;
  let appliedFiles: string[] = [];
  try {
    const { rows } = await pool.query<{ filename: string }>(
      "SELECT filename FROM migration_history"
    );
    appliedFiles = rows.map((r) => r.filename).sort();
  } catch (err) {
    // 42P01 = undefined_table: the migrator has never run against this database.
    if ((err as { code?: string })?.code !== "42P01") throw err;
  }
  const appliedSet = new Set(appliedFiles);
  return {
    applied: appliedFiles.length > 0 ? appliedFiles[appliedFiles.length - 1] : null,
    expected,
    pending: expectedFiles.filter((f) => !appliedSet.has(f))
  };
}

export class MigrationsBehindError extends Error {
  constructor(public readonly status: MigrationStatus) {
    super(
      `Database is behind: applied=${status.applied ?? "none"} expected=${status.expected ?? "none"} ` +
        `(${status.pending.length} pending). Run the migrator (pnpm --filter @fantasy-oscars/api run migrate) or set MIGRATE_ON_START=true.`
    );
    this.name = "MigrationsBehindError";
  }
}

export async function assertMigrationsCurrent(
  pool: Pick<Pool, "query">,
  expectedFiles?: string[]
): Promise<MigrationStatus> {
  const status = await getMigrationStatus(pool, expectedFiles);
  if (status.pending.length > 0) throw new MigrationsBehindError(status);
  return status;
}
