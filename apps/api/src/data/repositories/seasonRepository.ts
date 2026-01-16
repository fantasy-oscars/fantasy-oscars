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

export async function getSeasonById(
  client: DbClient,
  id: number
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
     WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function createSeason(
  client: DbClient,
  input: { league_id: number; ceremony_id: number; status?: SeasonRecord["status"] }
): Promise<SeasonRecord> {
  const { rows } = await query<SeasonRecord>(
    client,
    `INSERT INTO season (league_id, ceremony_id, status)
     VALUES ($1, $2, $3)
     RETURNING
       id::int,
       league_id::int,
       ceremony_id::int,
       status,
       created_at`,
    [input.league_id, input.ceremony_id, input.status ?? "EXTANT"]
  );
  return rows[0];
}

export async function listSeasonsForLeague(
  client: DbClient,
  leagueId: number,
  opts?: { includeCancelled?: boolean }
): Promise<SeasonRecord[]> {
  const includeCancelled = opts?.includeCancelled ?? false;
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
       ${includeCancelled ? "" : "AND status <> 'CANCELLED'"}
     ORDER BY created_at DESC`,
    [leagueId]
  );
  return rows;
}

export async function getMostRecentSeason(
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
     ORDER BY created_at DESC
     LIMIT 1`,
    [leagueId]
  );
  return rows[0] ?? null;
}

export async function cancelSeason(
  client: DbClient,
  seasonId: number
): Promise<SeasonRecord | null> {
  const { rows } = await query<SeasonRecord>(
    client,
    `UPDATE season
     SET status = 'CANCELLED'
     WHERE id = $1
     RETURNING
       id::int,
       league_id::int,
       ceremony_id::int,
       status,
       created_at`,
    [seasonId]
  );
  return rows[0] ?? null;
}
