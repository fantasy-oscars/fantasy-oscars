import { DbClient, query } from "../db.js";

export async function getActiveCeremonyId(client: DbClient): Promise<number | null> {
  const { rows } = await query<{ active_ceremony_id: number | null }>(
    client,
    `SELECT active_ceremony_id::int AS active_ceremony_id FROM app_config WHERE id = TRUE LIMIT 1`
  );
  return rows[0]?.active_ceremony_id ?? null;
}

export async function setActiveCeremonyId(
  client: DbClient,
  ceremonyId: number | null
): Promise<void> {
  await query(
    client,
    `
      INSERT INTO app_config (id, active_ceremony_id)
      VALUES (TRUE, $1)
      ON CONFLICT (id) DO UPDATE SET active_ceremony_id = EXCLUDED.active_ceremony_id
    `,
    [ceremonyId]
  );
}
