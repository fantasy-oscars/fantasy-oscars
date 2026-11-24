import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool as PgPool } from "pg";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
// pg is the API's dependency; the tour borrows it rather than adding one at the root.
const { Pool } = createRequire(path.join(repoRoot, "apps/api/package.json"))("pg") as {
  Pool: new (config: { connectionString: string }) => PgPool;
};

let pool: PgPool | null = null;

export function db(databaseUrl: string): PgPool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

export async function closeDb() {
  await pool?.end();
  pool = null;
}

/**
 * Moves the season `days` forward without touching the system clock: every date and
 * timestamp in the Circuit tables, and the dates of the Circuit's ceremonies, move
 * `days` back. Waiver windows, the ownership instant and scoring compare those with
 * now, so the app behaves exactly as if the days had passed. Triggers that keep
 * history append-only are bypassed for the shift (the database is the tour's own).
 */
export async function advanceDays(databaseUrl: string, circuitId: number, days: number) {
  const client = await db(databaseUrl).connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    const { rows } = await client.query<{
      table_name: string;
      column_name: string;
      data_type: string;
    }>(
      `SELECT c.table_name, c.column_name, c.data_type
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name
       WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
         AND c.table_name LIKE 'circuit%'
         AND c.is_generated = 'NEVER'
         AND c.data_type IN ('date', 'timestamp with time zone', 'timestamp without time zone')
       ORDER BY c.table_name, c.column_name`
    );
    const byTable = new Map<string, string[]>();
    for (const r of rows) {
      const shift =
        r.data_type === "date"
          ? `"${r.column_name}" = "${r.column_name}" - ${days}`
          : `"${r.column_name}" = "${r.column_name}" - interval '${days} days'`;
      byTable.set(r.table_name, [...(byTable.get(r.table_name) ?? []), shift]);
    }
    for (const [table, sets] of byTable) {
      await client.query(`UPDATE "${table}" SET ${sets.join(", ")}`);
    }
    await client.query(
      `UPDATE ceremony
       SET nominations_on = nominations_on - $2::int,
           starts_at = starts_at - make_interval(days => $2::int)
       WHERE id IN (SELECT ceremony_id FROM circuit_ceremony WHERE circuit_id = $1)`,
      [circuitId, days]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Runs every resolved waiver window now, as the operational runbook does. */
export function runWaivers(databaseUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "src/scripts/run-circuit-waivers.ts"],
      {
        cwd: path.join(repoRoot, "apps/api"),
        env: { ...process.env, DATABASE_URL: databaseUrl, LOG_FORMAT: "json" },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    let out = "";
    child.stdout.on("data", (c: Buffer) => (out += c.toString()));
    child.stderr.on("data", (c: Buffer) => (out += c.toString()));
    child.on("exit", (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`run-circuit-waivers exited ${code}\n${out}`))
    );
  });
}
