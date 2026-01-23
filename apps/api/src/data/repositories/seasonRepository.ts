import { DbClient, query } from "../db.js";

export type SeasonRecord = {
  id: number;
  league_id: number;
  ceremony_id: number;
  status: "EXTANT" | "CANCELLED";
  scoring_strategy_name: "fixed" | "negative";
  remainder_strategy?: "UNDRAFTED" | "FULL_POOL";
  pick_timer_seconds?: number | null;
  auto_pick_strategy?: string | null;
  created_at: Date;
  ceremony_starts_at?: Date | null;
  draft_id?: number | null;
  draft_status?: string | null;
};

export async function getExtantSeasonForLeague(
  client: DbClient,
  leagueId: number
): Promise<SeasonRecord | null> {
  const { rows } = await query<SeasonRecord>(
    client,
    `SELECT
       s.id::int,
       s.league_id::int,
       s.ceremony_id::int,
       s.status,
       s.scoring_strategy_name,
       s.remainder_strategy,
       d.pick_timer_seconds::int,
       d.auto_pick_strategy,
       s.created_at,
       c.starts_at AS ceremony_starts_at,
       d.id::int AS draft_id,
       d.status AS draft_status
     FROM season s
     JOIN ceremony c ON c.id = s.ceremony_id
     LEFT JOIN draft d ON d.season_id = s.id
     WHERE s.league_id = $1
       AND s.status = 'EXTANT'
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
       scoring_strategy_name,
       remainder_strategy,
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
       s.id::int,
       s.league_id::int,
       s.ceremony_id::int,
       s.status,
       s.scoring_strategy_name,
       s.remainder_strategy,
       d.pick_timer_seconds::int,
       d.auto_pick_strategy,
       s.created_at,
       c.starts_at AS ceremony_starts_at,
       d.id::int AS draft_id,
       d.status AS draft_status
     FROM season s
     JOIN ceremony c ON c.id = s.ceremony_id
     LEFT JOIN draft d ON d.season_id = s.id
     WHERE s.id = $1`,
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
       scoring_strategy_name,
       remainder_strategy,
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
       s.id::int,
       s.league_id::int,
       s.ceremony_id::int,
       s.status,
       s.scoring_strategy_name,
       s.remainder_strategy,
       d.pick_timer_seconds::int,
       d.auto_pick_strategy,
       s.created_at,
       c.starts_at AS ceremony_starts_at,
       d.id::int AS draft_id,
       d.status AS draft_status
     FROM season s
     JOIN ceremony c ON c.id = s.ceremony_id
     LEFT JOIN draft d ON d.season_id = s.id
     WHERE s.league_id = $1
       ${includeCancelled ? "" : "AND s.status <> 'CANCELLED'"}
     ORDER BY s.created_at DESC`,
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
       s.id::int,
       s.league_id::int,
       s.ceremony_id::int,
       s.status,
       s.scoring_strategy_name,
       s.remainder_strategy,
       d.pick_timer_seconds::int,
       d.auto_pick_strategy,
       s.created_at,
       c.starts_at AS ceremony_starts_at,
       d.id::int AS draft_id,
       d.status AS draft_status
     FROM season s
     JOIN ceremony c ON c.id = s.ceremony_id
     LEFT JOIN draft d ON d.season_id = s.id
     WHERE s.league_id = $1
     ORDER BY s.created_at DESC
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
       scoring_strategy_name,
       remainder_strategy,
       created_at`,
    [seasonId]
  );
  return rows[0] ?? null;
}

export async function updateSeasonScoringStrategy(
  client: DbClient,
  seasonId: number,
  strategy: SeasonRecord["scoring_strategy_name"]
): Promise<SeasonRecord | null> {
  const { rows } = await query<SeasonRecord>(
    client,
    `UPDATE season
     SET scoring_strategy_name = $2
     WHERE id = $1
     RETURNING
       id::int,
       league_id::int,
       ceremony_id::int,
       status,
       scoring_strategy_name,
       remainder_strategy,
       created_at`,
    [seasonId, strategy]
  );
  return rows[0] ?? null;
}

export async function updateSeasonRemainderStrategy(
  client: DbClient,
  seasonId: number,
  strategy: SeasonRecord["remainder_strategy"]
): Promise<SeasonRecord | null> {
  const { rows } = await query<SeasonRecord>(
    client,
    `UPDATE season
     SET remainder_strategy = $2
     WHERE id = $1
     RETURNING
       id::int,
       league_id::int,
       ceremony_id::int,
       status,
       scoring_strategy_name,
       remainder_strategy,
       created_at`,
    [seasonId, strategy]
  );
  return rows[0] ?? null;
}
