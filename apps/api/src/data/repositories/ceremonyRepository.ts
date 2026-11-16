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

export type CeremonyDates = {
  id: number;
  status: string;
  nominations_on: string | null;
  results_on: string | null;
};

/**
 * Sets the scoring occasion dates (whole days) at any status. An undefined
 * field is left as it is; null clears it. Returns null for a missing or
 * deleted ceremony.
 */
export async function updateCeremonyDates(
  client: DbClient,
  ceremonyId: number,
  dates: { nominations_on?: string | null; results_on?: string | null }
): Promise<CeremonyDates | null> {
  const { rows } = await query<CeremonyDates>(
    client,
    `UPDATE ceremony
     SET nominations_on = CASE WHEN $2::boolean THEN $3::date ELSE nominations_on END,
         results_on = CASE WHEN $4::boolean THEN $5::date ELSE results_on END
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id::int, status, nominations_on::text AS nominations_on,
       results_on::text AS results_on`,
    [
      ceremonyId,
      dates.nominations_on !== undefined,
      dates.nominations_on ?? null,
      dates.results_on !== undefined,
      dates.results_on ?? null
    ]
  );
  return rows[0] ?? null;
}
