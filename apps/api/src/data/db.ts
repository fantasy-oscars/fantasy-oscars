import { parsePgPoolConfig } from "../config/env.js";
import { log } from "../logger.js";
import { captureServerError } from "../observability/sentry.js";
import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

export type DbClient = Pool | PoolClient;

export function createPool(connectionString: string, poolConfig = parsePgPoolConfig()) {
  const pool = new Pool({ connectionString, ...poolConfig });
  // Idle clients emit 'error' when the backend goes away (restart, failover). Without a
  // listener Node treats it as uncaught and kills the process; pg discards the client.
  pool.on("error", (err) => {
    log({ level: "error", msg: "pg_pool_error", error: err.message });
    captureServerError(err);
  });
  return pool;
}

export async function runInTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  client: DbClient,
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  return client.query<T>(text, params);
}
