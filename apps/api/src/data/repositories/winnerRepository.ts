import { DbClient, query } from "../db.js";

export type CeremonyWinnerRecord = {
  id: number;
  ceremony_id: number;
  category_edition_id: number;
  nomination_id: number;
  created_at: Date;
  updated_at: Date;
};

export async function upsertWinner(
  client: DbClient,
  input: { ceremony_id: number; category_edition_id: number; nomination_id: number }
): Promise<CeremonyWinnerRecord> {
  const { rows } = await query<CeremonyWinnerRecord>(
    client,
    `INSERT INTO ceremony_winner (ceremony_id, category_edition_id, nomination_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (category_edition_id)
     DO UPDATE SET nomination_id = EXCLUDED.nomination_id, updated_at = now()
     RETURNING id::int, ceremony_id::int, category_edition_id::int, nomination_id::int, created_at, updated_at`,
    [input.ceremony_id, input.category_edition_id, input.nomination_id]
  );
  return rows[0];
}

export async function getWinnerByCategoryEdition(
  client: DbClient,
  categoryEditionId: number
): Promise<CeremonyWinnerRecord | null> {
  const { rows } = await query<CeremonyWinnerRecord>(
    client,
    `SELECT
       id::int,
       ceremony_id::int,
       category_edition_id::int,
       nomination_id::int,
       created_at,
       updated_at
     FROM ceremony_winner
     WHERE category_edition_id = $1`,
    [categoryEditionId]
  );
  return rows[0] ?? null;
}

export async function listWinnersByCeremony(
  client: DbClient,
  ceremonyId: number
): Promise<Array<{ category_edition_id: number; nomination_id: number }>> {
  const { rows } = await query<{
    category_edition_id: number;
    nomination_id: number;
  }>(
    client,
    `SELECT
       category_edition_id::int,
       nomination_id::int
     FROM ceremony_winner
     WHERE ceremony_id = $1
     ORDER BY category_edition_id`,
    [ceremonyId]
  );
  return rows.map((r) => ({
    category_edition_id: r.category_edition_id,
    nomination_id: r.nomination_id
  }));
}
