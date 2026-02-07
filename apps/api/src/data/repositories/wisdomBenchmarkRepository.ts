import type { DbClient } from "../db.js";
import { query } from "../db.js";

export type WisdomBenchmarkRow = {
  nomination_id: number;
  score: number;
  rank: number;
  sample_size: number;
};

export async function getWisdomBenchmarkForCeremony(
  db: DbClient,
  ceremonyId: number
): Promise<{
  ceremony_id: number;
  version: number;
  computed_at: Date;
  items: WisdomBenchmarkRow[];
} | null> {
  const head = await query<{
    ceremony_id: number;
    version: string | number;
    computed_at: Date;
  }>(
    db,
    `SELECT ceremony_id::int, version, computed_at
     FROM ceremony_wisdom_benchmark
     WHERE ceremony_id = $1
     LIMIT 1`,
    [ceremonyId]
  );
  const h = head.rows[0];
  if (!h) return null;
  const rows = await query<{
    nomination_id: number;
    score: number;
    rank: number;
    sample_size: number;
  }>(
    db,
    `SELECT nomination_id::int, score::float8, rank::int, sample_size::int
     FROM ceremony_wisdom_benchmark_item
     WHERE ceremony_id = $1
     ORDER BY rank ASC, nomination_id ASC`,
    [ceremonyId]
  );
  return {
    ceremony_id: Number(h.ceremony_id),
    version: Number(h.version),
    computed_at: h.computed_at,
    items: rows.rows.map((r) => ({
      nomination_id: Number(r.nomination_id),
      score: Number(r.score),
      rank: Number(r.rank),
      sample_size: Number(r.sample_size)
    }))
  };
}

export async function upsertWisdomBenchmarkForCeremony(
  db: DbClient,
  input: {
    ceremony_id: number;
    version: number;
    computed_at: Date;
    items: WisdomBenchmarkRow[];
  }
): Promise<void> {
  await query(
    db,
    `INSERT INTO ceremony_wisdom_benchmark (ceremony_id, version, computed_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (ceremony_id)
     DO UPDATE SET version = EXCLUDED.version, computed_at = EXCLUDED.computed_at`,
    [input.ceremony_id, input.version, input.computed_at]
  );

  // Replace all items to keep the recompute deterministic and simple.
  await query(db, `DELETE FROM ceremony_wisdom_benchmark_item WHERE ceremony_id = $1`, [
    input.ceremony_id
  ]);

  if (input.items.length === 0) return;
  const values: string[] = [];
  const params: unknown[] = [input.ceremony_id];
  let idx = 2;
  for (const item of input.items) {
    values.push(`($1, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
    params.push(item.nomination_id, item.score, item.rank, item.sample_size);
  }
  await query(
    db,
    `INSERT INTO ceremony_wisdom_benchmark_item (ceremony_id, nomination_id, score, rank, sample_size)
     VALUES ${values.join(", ")}`,
    params
  );
}
