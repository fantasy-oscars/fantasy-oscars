import { DbClient, query } from "../../db.js";
import type { DraftResultRecord } from "./types.js";

export async function listDraftResults(
  client: DbClient,
  draftId: number
): Promise<DraftResultRecord[]> {
  const { rows } = await query<DraftResultRecord>(
    client,
    `SELECT
       draft_id::int,
       nomination_id::int,
       won,
       points,
       created_at,
       updated_at
     FROM draft_result
     WHERE draft_id = $1
     ORDER BY nomination_id ASC`,
    [draftId]
  );
  return rows;
}

export async function upsertDraftResults(
  client: DbClient,
  draftId: number,
  results: Array<{ nomination_id: number; won: boolean; points: number | null }>
): Promise<void> {
  if (results.length === 0) return;
  for (const result of results) {
    await query(
      client,
      `INSERT INTO draft_result (draft_id, nomination_id, won, points)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (draft_id, nomination_id)
       DO UPDATE SET won = EXCLUDED.won, points = EXCLUDED.points, updated_at = now()`,
      [draftId, result.nomination_id, result.won, result.points]
    );
  }
}
