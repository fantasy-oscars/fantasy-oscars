import { DbClient, query } from "../db.js";

export async function lockCeremonyDraft(
  client: DbClient,
  ceremonyId: number
): Promise<Date | null> {
  const { rows } = await query<{ draft_locked_at: Date }>(
    client,
    `UPDATE ceremony
     SET draft_locked_at = COALESCE(draft_locked_at, now())
     WHERE id = $1
     RETURNING draft_locked_at`,
    [ceremonyId]
  );
  return rows[0]?.draft_locked_at ?? null;
}

export async function getCeremonyDraftLockedAt(
  client: DbClient,
  ceremonyId: number
): Promise<Date | null> {
  const { rows } = await query<{ draft_locked_at: Date | null }>(
    client,
    `SELECT draft_locked_at FROM ceremony WHERE id = $1`,
    [ceremonyId]
  );
  return rows[0]?.draft_locked_at ?? null;
}
