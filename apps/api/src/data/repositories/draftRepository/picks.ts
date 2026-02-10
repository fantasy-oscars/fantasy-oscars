import { DbClient, query } from "../../db.js";
import type { DraftPickRecord } from "./types.js";

export async function listDraftPicks(client: DbClient, draftId: number): Promise<DraftPickRecord[]> {
  const { rows } = await query<DraftPickRecord>(
    client,
    `SELECT
       id::int,
       draft_id::int,
       pick_number::int,
       round_number::int,
       seat_number::int,
       league_member_id::int,
       user_id::int,
       nomination_id::int,
       made_at
     FROM draft_pick
     WHERE draft_id = $1
     ORDER BY pick_number ASC`,
    [draftId]
  );
  return rows;
}

export async function countDraftPicks(client: DbClient, draftId: number): Promise<number> {
  const { rows } = await query<{ count: string }>(
    client,
    `SELECT COUNT(*)::int AS count FROM draft_pick WHERE draft_id = $1`,
    [draftId]
  );
  return rows[0]?.count ? Number(rows[0].count) : 0;
}

export async function getPickByNumber(
  client: DbClient,
  draftId: number,
  pickNumber: number
): Promise<DraftPickRecord | null> {
  const { rows } = await query<DraftPickRecord>(
    client,
    `SELECT * FROM draft_pick WHERE draft_id = $1 AND pick_number = $2`,
    [draftId, pickNumber]
  );
  return rows[0] ?? null;
}

export async function getPickByNomination(
  client: DbClient,
  draftId: number,
  nominationId: number
): Promise<DraftPickRecord | null> {
  const { rows } = await query<DraftPickRecord>(
    client,
    `SELECT * FROM draft_pick WHERE draft_id = $1 AND nomination_id = $2`,
    [draftId, nominationId]
  );
  return rows[0] ?? null;
}

export async function insertDraftPickRecord(
  client: DbClient,
  input: {
    draft_id: number;
    pick_number: number;
    round_number: number;
    seat_number: number;
    league_member_id: number;
    user_id: number;
    nomination_id: number;
    made_at: Date;
    request_id?: string | null;
  }
): Promise<DraftPickRecord> {
  const { rows } = await query<DraftPickRecord>(
    client,
    `INSERT INTO draft_pick
     (draft_id, pick_number, round_number, seat_number, league_member_id, user_id, nomination_id, made_at, request_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING
       id::int,
       draft_id::int,
       pick_number::int,
       round_number::int,
       seat_number::int,
       league_member_id::int,
       user_id::int,
       nomination_id::int,
       made_at,
       request_id`,
    [
      input.draft_id,
      input.pick_number,
      input.round_number,
      input.seat_number,
      input.league_member_id,
      input.user_id,
      input.nomination_id,
      input.made_at,
      input.request_id ?? null
    ]
  );
  return rows[0];
}

export async function getPickByRequestId(
  client: DbClient,
  draftId: number,
  requestId: string
): Promise<DraftPickRecord | null> {
  const { rows } = await query<DraftPickRecord>(
    client,
    `SELECT
       id::int,
       draft_id::int,
       pick_number::int,
       round_number::int,
       seat_number::int,
       league_member_id::int,
       user_id::int,
       nomination_id::int,
       made_at,
       request_id
     FROM draft_pick
     WHERE draft_id = $1 AND request_id = $2`,
    [draftId, requestId]
  );
  return rows[0] ?? null;
}

