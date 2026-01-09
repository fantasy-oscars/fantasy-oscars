import { DbClient, query } from "../db.js";

export type DraftRecord = {
  id: number;
  league_id: number;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  draft_order_type: "SNAKE" | "LINEAR";
  current_pick_number: number | null;
  started_at?: Date | null;
  completed_at?: Date | null;
};

export type DraftSeatRecord = {
  id: number;
  draft_id: number;
  league_member_id: number;
  seat_number: number;
  is_active: boolean;
  user_id?: number;
};

export type DraftPickRecord = {
  id: number;
  draft_id: number;
  pick_number: number;
  round_number: number;
  seat_number: number;
  league_member_id: number;
  user_id: number;
  nomination_id: number;
  made_at: Date | null;
  request_id?: string | null;
};

export async function createDraft(
  client: DbClient,
  input: {
    league_id: number;
    status: DraftRecord["status"];
    draft_order_type: DraftRecord["draft_order_type"];
    current_pick_number?: number | null;
    started_at?: Date | null;
    completed_at?: Date | null;
  }
): Promise<DraftRecord> {
  const { rows } = await query<DraftRecord>(
    client,
    `
      INSERT INTO draft (league_id, status, draft_order_type, current_pick_number, started_at, completed_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id::int,
        league_id::int,
        status,
        draft_order_type,
        current_pick_number,
        started_at,
        completed_at
    `,
    [
      input.league_id,
      input.status,
      input.draft_order_type,
      input.current_pick_number ?? null,
      input.started_at ?? null,
      input.completed_at ?? null
    ]
  );
  return rows[0];
}

export async function getDraftById(
  client: DbClient,
  id: number
): Promise<DraftRecord | null> {
  const { rows } = await query<DraftRecord>(client, `SELECT * FROM draft WHERE id = $1`, [
    id
  ]);
  return rows[0] ?? null;
}

export async function getDraftByIdForUpdate(
  client: DbClient,
  id: number
): Promise<DraftRecord | null> {
  const { rows } = await query<DraftRecord>(
    client,
    `SELECT * FROM draft WHERE id = $1 FOR UPDATE`,
    [id]
  );
  return rows[0] ?? null;
}

export async function updateDraftStatus(
  client: DbClient,
  id: number,
  status: DraftRecord["status"]
): Promise<DraftRecord | null> {
  const { rows } = await query<DraftRecord>(
    client,
    `UPDATE draft SET status = $2 WHERE id = $1 RETURNING *`,
    [id, status]
  );
  return rows[0] ?? null;
}

export async function deleteDraft(client: DbClient, id: number): Promise<void> {
  await query(client, `DELETE FROM draft WHERE id = $1`, [id]);
}

export async function getDraftByLeagueId(
  client: DbClient,
  leagueId: number
): Promise<DraftRecord | null> {
  const { rows } = await query<DraftRecord>(
    client,
    `SELECT * FROM draft WHERE league_id = $1`,
    [leagueId]
  );
  return rows[0] ?? null;
}

export async function updateDraftOnStart(
  client: DbClient,
  id: number,
  current_pick_number: number,
  started_at: Date
): Promise<DraftRecord | null> {
  const { rows } = await query<DraftRecord>(
    client,
    `UPDATE draft
     SET status = 'IN_PROGRESS',
         current_pick_number = $2,
         started_at = $3
     WHERE id = $1
     RETURNING
       id::int,
       league_id::int,
       status,
       draft_order_type,
       current_pick_number,
       started_at,
       completed_at`,
    [id, current_pick_number, started_at]
  );
  return rows[0] ?? null;
}

export async function countDraftSeats(
  client: DbClient,
  draftId: number
): Promise<number> {
  const { rows } = await query<{ count: string }>(
    client,
    `SELECT COUNT(*)::int AS count FROM draft_seat WHERE draft_id = $1`,
    [draftId]
  );
  return rows[0]?.count ? Number(rows[0].count) : 0;
}

export async function countNominations(client: DbClient): Promise<number> {
  const { rows } = await query<{ count: string }>(
    client,
    `SELECT COUNT(*)::int AS count FROM nomination`
  );
  return rows[0]?.count ? Number(rows[0].count) : 0;
}

export async function listDraftSeats(
  client: DbClient,
  draftId: number
): Promise<DraftSeatRecord[]> {
  const { rows } = await query<DraftSeatRecord>(
    client,
    `SELECT
       ds.id::int,
       ds.draft_id::int,
       ds.league_member_id::int,
       ds.seat_number::int,
       ds.is_active,
       lm.user_id::int AS user_id
     FROM draft_seat ds
     JOIN league_member lm ON lm.id = ds.league_member_id
     WHERE ds.draft_id = $1
     ORDER BY ds.seat_number ASC`,
    [draftId]
  );
  return rows;
}

export async function listDraftPicks(
  client: DbClient,
  draftId: number
): Promise<DraftPickRecord[]> {
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

export async function countDraftPicks(
  client: DbClient,
  draftId: number
): Promise<number> {
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

export async function getNominationById(
  client: DbClient,
  nominationId: number
): Promise<{ id: number } | null> {
  const { rows } = await query<{ id: number }>(
    client,
    `SELECT id::int FROM nomination WHERE id = $1`,
    [nominationId]
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

export async function updateDraftCurrentPick(
  client: DbClient,
  draftId: number,
  nextPickNumber: number | null
): Promise<DraftRecord | null> {
  const { rows } = await query<DraftRecord>(
    client,
    `UPDATE draft
     SET current_pick_number = $2
     WHERE id = $1
     RETURNING *`,
    [draftId, nextPickNumber]
  );
  return rows[0] ?? null;
}

export async function updateDraftOnComplete(
  client: DbClient,
  draftId: number,
  completedAt: Date
): Promise<DraftRecord | null> {
  const { rows } = await query<DraftRecord>(
    client,
    `UPDATE draft
     SET status = 'COMPLETED',
         completed_at = $2,
         current_pick_number = NULL
     WHERE id = $1
     RETURNING id::int,
       league_id::int,
       status,
       draft_order_type,
       current_pick_number::int,
       started_at,
       completed_at`,
    [draftId, completedAt]
  );
  return rows[0] ?? null;
}

export async function completeDraftIfReady(
  client: DbClient,
  draftId: number,
  completedAt: Date,
  requiredPickCount: number
): Promise<DraftRecord | null> {
  const { rows } = await query<DraftRecord>(
    client,
    `UPDATE draft
     SET status = 'COMPLETED',
         completed_at = $2,
         current_pick_number = NULL
     WHERE id = $1
       AND status <> 'COMPLETED'
       AND (SELECT COUNT(*) FROM draft_pick WHERE draft_id = $1) >= $3
     RETURNING id::int,
       league_id::int,
       status,
       draft_order_type,
       current_pick_number::int,
       started_at,
       completed_at`,
    [draftId, completedAt, requiredPickCount]
  );
  return rows[0] ?? null;
}
