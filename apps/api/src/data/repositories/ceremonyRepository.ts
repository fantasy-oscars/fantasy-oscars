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

export async function getCeremonyStatus(
  client: DbClient,
  ceremonyId: number
): Promise<string | null> {
  const { rows } = await query<{ status: string }>(
    client,
    `SELECT status FROM ceremony WHERE id = $1`,
    [ceremonyId]
  );
  return rows[0]?.status ?? null;
}

export type CeremonyDates = {
  id: number;
  status: string;
  nominations_on: string | null;
  starts_at: Date | null;
};

/**
 * Sets the nominations date (a whole day) at any status; null clears it. The
 * results date is not stored: it is derived from starts_at. Returns null for
 * a missing or deleted ceremony.
 */
export async function updateCeremonyDates(
  client: DbClient,
  ceremonyId: number,
  dates: { nominations_on: string | null }
): Promise<CeremonyDates | null> {
  const { rows } = await query<CeremonyDates>(
    client,
    `UPDATE ceremony
     SET nominations_on = $2::date
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id::int, status, nominations_on::text AS nominations_on, starts_at`,
    [ceremonyId, dates.nominations_on]
  );
  return rows[0] ?? null;
}
