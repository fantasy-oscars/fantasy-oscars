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
