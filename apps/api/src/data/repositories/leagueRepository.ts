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
