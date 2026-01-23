import { DbClient, query } from "../db.js";

export type LeagueRecord = {
  id: number;
  code: string;
  name: string;
  ceremony_id: number;
  max_members: number;
  roster_size: number;
  is_public: boolean;
  created_by_user_id: number;
  created_at: Date;
};

export type LeagueMemberRecord = {
  id: number;
  league_id: number;
  user_id: number;
  role: "OWNER" | "CO_OWNER" | "MEMBER";
  joined_at: Date;
};

export type LeagueMemberWithUser = LeagueMemberRecord & {
  handle: string;
  display_name: string;
};

export async function createLeague(
  client: DbClient,
  input: {
    code: string;
    name: string;
    ceremony_id: number;
    max_members: number;
    roster_size: number;
    is_public: boolean;
    created_by_user_id: number;
  }
): Promise<LeagueRecord> {
  const { rows } = await query<LeagueRecord>(
    client,
    `
      INSERT INTO league (code, name, ceremony_id, max_members, roster_size, is_public, created_by_user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        id::int,
        code,
        name,
        ceremony_id::int,
        max_members,
        roster_size,
        is_public,
        created_by_user_id::int,
        created_at
    `,
    [
      input.code,
      input.name,
      input.ceremony_id,
      input.max_members,
      input.roster_size,
      input.is_public,
      input.created_by_user_id
    ]
  );
  return rows[0];
}

export async function getLeagueById(
  client: DbClient,
  id: number
): Promise<LeagueRecord | null> {
  const { rows } = await query<LeagueRecord>(
    client,
    `SELECT
       id::int,
       code,
       name,
       ceremony_id::int,
       max_members,
       roster_size,
       is_public,
       created_by_user_id::int,
       created_at
     FROM league WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function updateLeagueName(
  client: DbClient,
  id: number,
  name: string
): Promise<LeagueRecord | null> {
  const { rows } = await query<LeagueRecord>(
    client,
    `UPDATE league SET name = $2 WHERE id = $1 RETURNING *`,
    [id, name]
  );
  return rows[0] ?? null;
}

export async function deleteLeague(client: DbClient, id: number): Promise<void> {
  await query(client, `DELETE FROM league WHERE id = $1`, [id]);
}

export async function getLeagueMember(
  client: DbClient,
  leagueId: number,
  userId: number
): Promise<LeagueMemberRecord | null> {
  const { rows } = await query<LeagueMemberRecord>(
    client,
    `SELECT
       id::int,
       league_id::int,
       user_id::int,
       role,
       joined_at
     FROM league_member
     WHERE league_id = $1 AND user_id = $2`,
    [leagueId, userId]
  );
  return rows[0] ?? null;
}

export async function countLeagueMembers(
  client: DbClient,
  leagueId: number
): Promise<number> {
  const { rows } = await query<{ count: string }>(
    client,
    `SELECT COUNT(*)::int AS count FROM league_member WHERE league_id = $1`,
    [leagueId]
  );
  return rows[0]?.count ? Number(rows[0].count) : 0;
}

export async function createLeagueMember(
  client: DbClient,
  input: { league_id: number; user_id: number; role?: LeagueMemberRecord["role"] }
): Promise<LeagueMemberRecord> {
  const role = input.role ?? "MEMBER";
  const { rows } = await query<LeagueMemberRecord>(
    client,
    `INSERT INTO league_member (league_id, user_id, role)
     VALUES ($1, $2, $3)
     RETURNING id::int, league_id::int, user_id::int, role, joined_at`,
    [input.league_id, input.user_id, role]
  );
  return rows[0];
}

export async function deleteLeagueMember(
  client: DbClient,
  leagueId: number,
  userId: number
): Promise<void> {
  await query(client, `DELETE FROM league_member WHERE league_id = $1 AND user_id = $2`, [
    leagueId,
    userId
  ]);
}

export async function listLeaguesForUser(
  client: DbClient,
  userId: number
): Promise<LeagueRecord[]> {
  const { rows } = await query<LeagueRecord>(
    client,
    `SELECT DISTINCT ON (l.id)
       l.id::int,
       l.code,
       l.name,
       l.ceremony_id::int,
       l.max_members,
       l.roster_size,
       l.is_public,
       l.created_by_user_id::int,
       l.created_at
     FROM league l
     JOIN league_member lm ON lm.league_id = l.id
     JOIN season s ON s.league_id = l.id AND s.status = 'EXTANT'
     WHERE lm.user_id = $1
     ORDER BY l.id, l.created_at DESC`,
    [userId]
  );
  return rows;
}

export async function listPublicLeagues(
  client: DbClient,
  opts?: { search?: string }
): Promise<
  Array<
    LeagueRecord & {
      season_id: number | null;
      season_status: string | null;
      member_count: number;
    }
  >
> {
  const search = opts?.search ? `%${opts.search.toLowerCase()}%` : null;
  const { rows } = await query<
    LeagueRecord & {
      season_id: number | null;
      season_status: string | null;
      member_count: number;
    }
  >(
    client,
    `SELECT
       l.id::int,
       l.code,
       l.name,
       l.ceremony_id::int,
       l.max_members::int,
       l.roster_size::int,
       l.is_public,
       l.created_by_user_id::int,
       l.created_at,
       s.id::int AS season_id,
       s.status AS season_status,
       COALESCE(sm.count, 0)::int AS member_count
     FROM league l
     LEFT JOIN season s ON s.league_id = l.id AND s.status = 'EXTANT'
     LEFT JOIN (
       SELECT season_id, COUNT(*) AS count FROM season_member GROUP BY season_id
     ) sm ON sm.season_id = s.id
     WHERE l.is_public = TRUE
       ${search ? "AND (LOWER(l.name) LIKE $1 OR LOWER(l.code) LIKE $1)" : ""}
     ORDER BY l.created_at DESC
     LIMIT 100`,
    search ? [search] : []
  );
  return rows;
}

export async function getDraftSeatForUser(
  client: DbClient,
  draftId: number,
  userId: number
): Promise<{ seat_id: number; seat_number: number; league_member_id: number } | null> {
  const { rows } = await query<{
    seat_id: number;
    seat_number: number;
    league_member_id: number;
  }>(
    client,
    `SELECT
       ds.id::int AS seat_id,
       ds.seat_number::int,
       ds.league_member_id::int
     FROM draft_seat ds
     JOIN league_member lm ON lm.id = ds.league_member_id
     WHERE ds.draft_id = $1 AND lm.user_id = $2`,
    [draftId, userId]
  );
  return rows[0] ?? null;
}

export async function listLeagueRoster(
  client: DbClient,
  leagueId: number
): Promise<LeagueMemberWithUser[]> {
  const { rows } = await query<LeagueMemberWithUser>(
    client,
    `SELECT
       lm.id::int,
       lm.league_id::int,
       lm.user_id::int,
       lm.role,
       lm.joined_at,
       u.handle,
       u.display_name
     FROM league_member lm
     JOIN app_user u ON u.id = lm.user_id
     WHERE lm.league_id = $1
     ORDER BY lm.joined_at ASC`,
    [leagueId]
  );
  return rows;
}

export async function countCommissioners(
  client: DbClient,
  leagueId: number
): Promise<number> {
  const { rows } = await query<{ count: string }>(
    client,
    `SELECT COUNT(*)::int AS count
     FROM league_member
     WHERE league_id = $1 AND role IN ('OWNER','CO_OWNER')`,
    [leagueId]
  );
  return rows[0]?.count ? Number(rows[0].count) : 0;
}

export async function updateLeagueMemberRole(
  client: DbClient,
  leagueId: number,
  userId: number,
  role: LeagueMemberRecord["role"]
): Promise<LeagueMemberRecord | null> {
  const { rows } = await query<LeagueMemberRecord>(
    client,
    `UPDATE league_member
     SET role = $3
     WHERE league_id = $1 AND user_id = $2
     RETURNING id::int, league_id::int, user_id::int, role, joined_at`,
    [leagueId, userId, role]
  );
  return rows[0] ?? null;
}
