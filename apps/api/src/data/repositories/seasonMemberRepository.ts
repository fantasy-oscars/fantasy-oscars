import { DbClient, query } from "../db.js";

export type SeasonMemberRecord = {
  id: number;
  season_id: number;
  user_id: number;
  league_member_id: number | null;
  role: "OWNER" | "CO_OWNER" | "MEMBER";
  joined_at: Date;
  username?: string;
};

export async function listSeasonMembers(
  client: DbClient,
  seasonId: number
): Promise<SeasonMemberRecord[]> {
  const { rows } = await query<SeasonMemberRecord>(
    client,
    `SELECT
       sm.id::int,
       sm.season_id::int,
       sm.user_id::int,
       sm.league_member_id::int,
       sm.role,
       sm.joined_at,
       u.username
     FROM season_member sm
     JOIN app_user u ON u.id = sm.user_id
     WHERE season_id = $1
     ORDER BY sm.joined_at ASC`,
    [seasonId]
  );
  return rows;
}

export async function getSeasonMember(
  client: DbClient,
  seasonId: number,
  userId: number
): Promise<SeasonMemberRecord | null> {
  const { rows } = await query<SeasonMemberRecord>(
    client,
    `SELECT
       id::int,
       season_id::int,
       user_id::int,
       league_member_id::int,
       role,
       joined_at
     FROM season_member
     WHERE season_id = $1 AND user_id = $2`,
    [seasonId, userId]
  );
  return rows[0] ?? null;
}

export async function countSeasonMembers(
  client: DbClient,
  seasonId: number
): Promise<number> {
  const { rows } = await query<{ count: string }>(
    client,
    `SELECT COUNT(*)::int AS count FROM season_member WHERE season_id = $1`,
    [seasonId]
  );
  return rows[0]?.count ? Number(rows[0].count) : 0;
}

export async function addSeasonMember(
  client: DbClient,
  input: {
    season_id: number;
    user_id: number;
    league_member_id: number | null;
    role?: SeasonMemberRecord["role"];
  }
): Promise<SeasonMemberRecord> {
  const role = input.role ?? "MEMBER";
  const { rows } = await query<SeasonMemberRecord>(
    client,
    `INSERT INTO season_member (season_id, user_id, league_member_id, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (season_id, user_id) DO NOTHING
     RETURNING
       id::int,
       season_id::int,
       user_id::int,
       league_member_id::int,
       role,
       joined_at`,
    [input.season_id, input.user_id, input.league_member_id, role]
  );
  return rows[0];
}

export async function removeSeasonMember(
  client: DbClient,
  seasonId: number,
  userId: number
): Promise<void> {
  await query(client, `DELETE FROM season_member WHERE season_id = $1 AND user_id = $2`, [
    seasonId,
    userId
  ]);
}
