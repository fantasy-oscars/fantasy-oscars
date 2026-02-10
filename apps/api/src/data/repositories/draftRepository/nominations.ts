import { DbClient, query } from "../../db.js";

export async function hasDraftsStartedForCeremony(
  client: DbClient,
  ceremonyId: number
): Promise<boolean> {
  const { rows } = await query<{ exists: boolean }>(
    client,
    `SELECT EXISTS (
       SELECT 1
       FROM draft d
       JOIN season s ON s.id = d.season_id
       WHERE s.ceremony_id = $1
         AND d.status <> 'PENDING'
     ) AS exists`,
    [ceremonyId]
  );
  return Boolean(rows[0]?.exists);
}

export async function countNominationsByCeremony(
  client: DbClient,
  ceremonyId: number
): Promise<number> {
  const { rows } = await query<{ count: string }>(
    client,
    `SELECT COUNT(*)::int AS count
     FROM nomination n
     JOIN category_edition ce ON ce.id = n.category_edition_id
     WHERE ce.ceremony_id = $1`,
    [ceremonyId]
  );
  return rows[0]?.count ? Number(rows[0].count) : 0;
}

export async function getNominationByIdForCeremony(
  client: DbClient,
  nominationId: number,
  ceremonyId: number
): Promise<{ id: number } | null> {
  const { rows } = await query<{ id: number }>(
    client,
    `SELECT n.id::int
     FROM nomination n
     JOIN category_edition ce ON ce.id = n.category_edition_id
     WHERE n.id = $1 AND ce.ceremony_id = $2`,
    [nominationId, ceremonyId]
  );
  return rows[0] ?? null;
}

export async function countNominations(client: DbClient): Promise<number> {
  const { rows } = await query<{ count: string }>(client, `SELECT COUNT(*)::int AS count FROM nomination`);
  return rows[0]?.count ? Number(rows[0].count) : 0;
}

export async function listNominationIds(client: DbClient, nominationIds: number[]): Promise<number[]> {
  const { rows } = await query<{ id: number }>(client, `SELECT id::int FROM nomination WHERE id = ANY($1)`, [
    nominationIds
  ]);
  return rows.map((row) => row.id);
}

export async function listNominationIdsByCeremony(
  client: DbClient,
  ceremonyId: number
): Promise<number[]> {
  const { rows } = await query<{ id: number }>(
    client,
    `SELECT n.id::int
     FROM nomination n
     JOIN category_edition ce ON ce.id = n.category_edition_id
     WHERE ce.ceremony_id = $1
     ORDER BY n.id ASC`,
    [ceremonyId]
  );
  return rows.map((row) => row.id);
}

export async function getNominationById(
  client: DbClient,
  nominationId: number
): Promise<{ id: number } | null> {
  const { rows } = await query<{ id: number }>(client, `SELECT id::int FROM nomination WHERE id = $1`, [
    nominationId
  ]);
  return rows[0] ?? null;
}

