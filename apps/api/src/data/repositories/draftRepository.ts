import { DbClient, query } from "../db.js";

export type DraftRecord = {
  id: number;
  league_id: number;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  draft_order_type: "SNAKE" | "LINEAR";
  current_pick_number: number | null;
};

export async function createDraft(
  client: DbClient,
  input: {
    league_id: number;
    status: DraftRecord["status"];
    draft_order_type: DraftRecord["draft_order_type"];
    current_pick_number?: number | null;
  }
): Promise<DraftRecord> {
  const { rows } = await query<DraftRecord>(
    client,
    `
      INSERT INTO draft (league_id, status, draft_order_type, current_pick_number)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
    [
      input.league_id,
      input.status,
      input.draft_order_type,
      input.current_pick_number ?? null
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
