import { query, type DbClient } from "../../data/db.js";

export function normalizeDraftPlanName(name: string): string {
  return name.trim().toLowerCase();
}

export async function listDefaultNominationIdsForCeremony(
  db: DbClient,
  ceremonyId: number
): Promise<number[]> {
  const { rows } = await query<{ id: number }>(
    db,
    `
      SELECT n.id::int AS id
      FROM nomination n
      JOIN category_edition ce ON ce.id = n.category_edition_id
      WHERE ce.ceremony_id = $1 AND n.status = 'ACTIVE'
      ORDER BY ce.sort_index ASC, n.sort_order ASC, n.id ASC
    `,
    [ceremonyId]
  );
  return rows.map((r) => r.id);
}

