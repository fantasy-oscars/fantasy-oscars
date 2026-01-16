import { DbClient, query } from "../db.js";

export type SeasonRecord = {
  id: number;
  league_id: number;
  ceremony_id: number;
  status: "EXTANT" | "CANCELLED";
  created_at: Date;
};

export async function getExtantSeasonForLeague(
  client: DbClient,
  leagueId: number
): Promise<SeasonRecord | null> {
  const { rows } = await query<SeasonRecord>(
    client,
    `SELECT
       id::int,
       league_id::int,
       ceremony_id::int,
       status,
       created_at
     FROM season
     WHERE league_id = $1
       AND status = 'EXTANT'
     LIMIT 1`,
    [leagueId]
  );
  return rows[0] ?? null;
}

export async function createExtantSeason(
  client: DbClient,
  input: { league_id: number; ceremony_id: number }
): Promise<SeasonRecord> {
  const { rows } = await query<SeasonRecord>(
    client,
    `INSERT INTO season (league_id, ceremony_id, status)
     VALUES ($1, $2, 'EXTANT')
     ON CONFLICT (league_id, ceremony_id) WHERE status = 'EXTANT'
     DO UPDATE SET ceremony_id = EXCLUDED.ceremony_id
     RETURNING
       id::int,
       league_id::int,
       ceremony_id::int,
       status,
       created_at`,
    [input.league_id, input.ceremony_id]
  );
  return rows[0];
}
