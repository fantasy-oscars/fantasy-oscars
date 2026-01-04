import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

export type DbClient = Pool | PoolClient;

export function createPool(connectionString: string) {
  return new Pool({ connectionString });
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
