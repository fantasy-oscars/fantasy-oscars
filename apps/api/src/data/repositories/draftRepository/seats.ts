import { DbClient, query } from "../../db.js";
import type { DraftSeatRecord } from "./types.js";

export async function countDraftSeats(client: DbClient, draftId: number): Promise<number> {
  const { rows } = await query<{ count: string }>(
    client,
    `SELECT COUNT(*)::int AS count FROM draft_seat WHERE draft_id = $1`,
    [draftId]
  );
  return rows[0]?.count ? Number(rows[0].count) : 0;
}

export async function listDraftSeats(client: DbClient, draftId: number): Promise<DraftSeatRecord[]> {
  const { rows } = await query<DraftSeatRecord>(
    client,
    `SELECT
       ds.id::int,
       ds.draft_id::int,
       ds.league_member_id::int,
       ds.seat_number::int,
       ds.is_active,
       lm.user_id::int AS user_id,
       u.username,
       u.avatar_key
     FROM draft_seat ds
     JOIN league_member lm ON lm.id = ds.league_member_id
     JOIN app_user u ON u.id = lm.user_id
     WHERE ds.draft_id = $1
     ORDER BY ds.seat_number ASC`,
    [draftId]
  );
  return rows;
}

export async function createDraftSeats(
  client: DbClient,
  input: { draft_id: number; league_member_ids_in_order: number[] }
): Promise<DraftSeatRecord[]> {
  if (input.league_member_ids_in_order.length === 0) return [];
  const values = input.league_member_ids_in_order.map((id, idx) => `($1, ${idx + 1}, ${id})`).join(", ");
  const { rows } = await query<DraftSeatRecord>(
    client,
    `INSERT INTO draft_seat (draft_id, seat_number, league_member_id)
     VALUES ${values}
     ON CONFLICT DO NOTHING
     RETURNING
       id::int,
       draft_id::int,
       league_member_id::int,
       seat_number::int,
       is_active`,
    [input.draft_id]
  );
  return rows;
}

