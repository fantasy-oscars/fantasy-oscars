import { type DbClient, query } from "../db.js";

/*
 * Circuit leagues, their settings and membership (migration 027). Member and
 * event writes are called only from services/circuit/circuitLeagues.ts, after
 * the league row is locked and assertCircuitLeagueOpen has passed.
 */

export type CircuitLeagueRow = {
  id: number;
  circuit_id: number;
  league_id: number;
  status: string;
  roster_size: number;
  draft_type: string;
  pick_timer_seconds: number | null;
  auto_draft_enabled: boolean;
  nomination_points: number;
  win_bonus_points: number;
  initialized_at: Date | null;
  created_by_user_id: number;
  created_at: Date;
};

export type CircuitLeagueSummaryRow = CircuitLeagueRow & {
  circuit_code: string;
  circuit_name: string;
  circuit_status: string;
  member_count: number;
  is_member: boolean;
};

export type CircuitLeagueEventSettingRow = {
  circuit_event_id: number;
  weight: number;
};

export type CircuitLeagueCategorySettingRow = {
  circuit_category_id: number;
  weight: number;
  max_owned: number | null;
};

export type CircuitLeagueMemberRow = {
  id: number;
  circuit_league_id: number;
  user_id: number;
  username: string;
  avatar_key: string;
  joined_at: Date;
};

export type CircuitLeagueSettingsPatch = Partial<
  Pick<
    CircuitLeagueRow,
    | "roster_size"
    | "pick_timer_seconds"
    | "auto_draft_enabled"
    | "nomination_points"
    | "win_bonus_points"
  >
>;

const LEAGUE_COLUMNS = `cl.id::int, cl.circuit_id::int, cl.league_id::int, cl.status,
  cl.roster_size, cl.draft_type, cl.pick_timer_seconds, cl.auto_draft_enabled,
  cl.nomination_points, cl.win_bonus_points, cl.initialized_at,
  cl.created_by_user_id::int, cl.created_at`;

// ---------------------------------------------------------------------------
// League
// ---------------------------------------------------------------------------

/**
 * Inserts the league row with the column defaults, then enables every event of
 * the Circuit and gives every category weight 1 and no limit. Returns null
 * when the league already runs this Circuit.
 */
export async function insertCircuitLeague(
  client: DbClient,
  input: { circuit_id: number; league_id: number; created_by_user_id: number }
): Promise<CircuitLeagueRow | null> {
  const { rows } = await query<CircuitLeagueRow>(
    client,
    `INSERT INTO circuit_league AS cl (circuit_id, league_id, created_by_user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (circuit_id, league_id) DO NOTHING
     RETURNING ${LEAGUE_COLUMNS}`,
    [input.circuit_id, input.league_id, input.created_by_user_id]
  );
  const league = rows[0];
  if (!league) return null;
  await query(
    client,
    `INSERT INTO circuit_league_event (circuit_league_id, circuit_id, circuit_event_id)
     SELECT $1, e.circuit_id, e.id FROM circuit_event e WHERE e.circuit_id = $2`,
    [league.id, league.circuit_id]
  );
  await query(
    client,
    `INSERT INTO circuit_league_category
       (circuit_league_id, circuit_id, circuit_category_id)
     SELECT $1, c.circuit_id, c.id FROM circuit_category c WHERE c.circuit_id = $2`,
    [league.id, league.circuit_id]
  );
  return league;
}

export async function getCircuitLeagueById(
  client: DbClient,
  id: number,
  opts: { forUpdate?: boolean } = {}
): Promise<CircuitLeagueRow | null> {
  const { rows } = await query<CircuitLeagueRow>(
    client,
    `SELECT ${LEAGUE_COLUMNS} FROM circuit_league cl WHERE cl.id = $1
     ${opts.forUpdate ? "FOR UPDATE" : ""}`,
    [id]
  );
  return rows[0] ?? null;
}

/** A league's Circuit competitions, newest first, with the viewer's membership. */
export async function listCircuitLeaguesForLeague(
  client: DbClient,
  leagueId: number,
  viewerUserId: number
): Promise<CircuitLeagueSummaryRow[]> {
  const { rows } = await query<CircuitLeagueSummaryRow>(
    client,
    `SELECT ${LEAGUE_COLUMNS},
       c.code AS circuit_code, c.name AS circuit_name, c.status AS circuit_status,
       (SELECT COUNT(*)::int FROM circuit_league_member m
        WHERE m.circuit_league_id = cl.id) AS member_count,
       EXISTS (SELECT 1 FROM circuit_league_member m
               WHERE m.circuit_league_id = cl.id AND m.user_id = $2) AS is_member
     FROM circuit_league cl
     JOIN circuit c ON c.id = cl.circuit_id
     WHERE cl.league_id = $1
     ORDER BY cl.created_at DESC, cl.id DESC`,
    [leagueId, viewerUserId]
  );
  return rows;
}

/** Sets the given settings; the caller checks which the status allows. */
export async function updateCircuitLeagueSettings(
  client: DbClient,
  id: number,
  patch: CircuitLeagueSettingsPatch
): Promise<CircuitLeagueRow> {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  const sets = entries.map(([key], i) => `${key} = $${i + 2}`);
  const { rows } = await query<CircuitLeagueRow>(
    client,
    `UPDATE circuit_league AS cl SET ${sets.join(", ")}
     WHERE cl.id = $1
     RETURNING ${LEAGUE_COLUMNS}`,
    [id, ...entries.map(([, value]) => value)]
  );
  return rows[0]!;
}

/** SETUP → INITIALIZED. Returns null when the league is not in SETUP. */
export async function markCircuitLeagueInitialized(
  client: DbClient,
  id: number
): Promise<CircuitLeagueRow | null> {
  const { rows } = await query<CircuitLeagueRow>(
    client,
    `UPDATE circuit_league AS cl
     SET status = 'INITIALIZED', initialized_at = now()
     WHERE cl.id = $1 AND cl.status = 'SETUP'
     RETURNING ${LEAGUE_COLUMNS}`,
    [id]
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Events and categories
// ---------------------------------------------------------------------------

/** The enabled events: one row each. */
export async function listCircuitLeagueEvents(
  client: DbClient,
  circuitLeagueId: number
): Promise<CircuitLeagueEventSettingRow[]> {
  const { rows } = await query<CircuitLeagueEventSettingRow>(
    client,
    `SELECT circuit_event_id::int, weight::float8 AS weight
     FROM circuit_league_event
     WHERE circuit_league_id = $1`,
    [circuitLeagueId]
  );
  return rows;
}

/** Replaces the enabled events with exactly `events` (possibly none). */
export async function replaceCircuitLeagueEvents(
  client: DbClient,
  league: { id: number; circuit_id: number },
  events: ReadonlyArray<{ circuit_event_id: number; weight: number }>
): Promise<void> {
  await query(client, `DELETE FROM circuit_league_event WHERE circuit_league_id = $1`, [
    league.id
  ]);
  if (events.length === 0) return;
  await query(
    client,
    `INSERT INTO circuit_league_event
       (circuit_league_id, circuit_id, circuit_event_id, weight)
     SELECT $1, $2, e.id, e.weight
     FROM unnest($3::bigint[], $4::numeric[]) AS e(id, weight)`,
    [
      league.id,
      league.circuit_id,
      events.map((e) => e.circuit_event_id),
      events.map((e) => e.weight)
    ]
  );
}

/** Stored category settings; a category without a row has the defaults. */
export async function listCircuitLeagueCategories(
  client: DbClient,
  circuitLeagueId: number
): Promise<CircuitLeagueCategorySettingRow[]> {
  const { rows } = await query<CircuitLeagueCategorySettingRow>(
    client,
    `SELECT circuit_category_id::int, weight::float8 AS weight, max_owned
     FROM circuit_league_category
     WHERE circuit_league_id = $1`,
    [circuitLeagueId]
  );
  return rows;
}

export async function upsertCircuitLeagueCategories(
  client: DbClient,
  league: { id: number; circuit_id: number },
  categories: ReadonlyArray<{
    circuit_category_id: number;
    weight: number;
    max_owned: number | null;
  }>
): Promise<void> {
  await query(
    client,
    `INSERT INTO circuit_league_category
       (circuit_league_id, circuit_id, circuit_category_id, weight, max_owned)
     SELECT $1, $2, c.id, c.weight, c.max_owned
     FROM unnest($3::bigint[], $4::numeric[], $5::int[]) AS c(id, weight, max_owned)
     ON CONFLICT (circuit_league_id, circuit_category_id)
     DO UPDATE SET weight = EXCLUDED.weight, max_owned = EXCLUDED.max_owned`,
    [
      league.id,
      league.circuit_id,
      categories.map((c) => c.circuit_category_id),
      categories.map((c) => c.weight),
      categories.map((c) => c.max_owned)
    ]
  );
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export async function listCircuitLeagueMembers(
  client: DbClient,
  circuitLeagueId: number
): Promise<CircuitLeagueMemberRow[]> {
  const { rows } = await query<CircuitLeagueMemberRow>(
    client,
    `SELECT m.id::int, m.circuit_league_id::int, m.user_id::int, u.username,
       u.avatar_key, m.joined_at
     FROM circuit_league_member m
     JOIN app_user u ON u.id = m.user_id
     WHERE m.circuit_league_id = $1
     ORDER BY m.joined_at, m.id`,
    [circuitLeagueId]
  );
  return rows;
}

/** Adds the member; false when they were already one. */
export async function insertCircuitLeagueMember(
  client: DbClient,
  circuitLeagueId: number,
  userId: number
): Promise<boolean> {
  const res = await query(
    client,
    `INSERT INTO circuit_league_member (circuit_league_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (circuit_league_id, user_id) DO NOTHING`,
    [circuitLeagueId, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

/** Removes the member; false when they were not one. */
export async function deleteCircuitLeagueMember(
  client: DbClient,
  circuitLeagueId: number,
  userId: number
): Promise<boolean> {
  const res = await query(
    client,
    `DELETE FROM circuit_league_member WHERE circuit_league_id = $1 AND user_id = $2`,
    [circuitLeagueId, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function countCircuitLeagueMembers(
  client: DbClient,
  circuitLeagueId: number
): Promise<number> {
  const { rows } = await query<{ count: number }>(
    client,
    `SELECT COUNT(*)::int AS count FROM circuit_league_member WHERE circuit_league_id = $1`,
    [circuitLeagueId]
  );
  return rows[0]?.count ?? 0;
}
