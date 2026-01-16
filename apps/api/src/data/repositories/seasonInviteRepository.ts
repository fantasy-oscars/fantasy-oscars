import { DbClient, query } from "../db.js";

export type SeasonInviteRecord = {
  id: number;
  season_id: number;
  intended_user_id: number | null;
  token_hash: string | null;
  kind: "PLACEHOLDER" | "USER_TARGETED";
  status: "PENDING" | "CLAIMED" | "REVOKED" | "DECLINED";
  label: string | null;
  created_by_user_id: number;
  claimed_by_user_id: number | null;
  claimed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function mapInvite(row: Record<string, unknown>): SeasonInviteRecord {
  return {
    id: Number(row.id),
    season_id: Number(row.season_id),
    intended_user_id: row.intended_user_id ? Number(row.intended_user_id) : null,
    token_hash: row.token_hash as string | null,
    kind: row.kind as SeasonInviteRecord["kind"],
    status: row.status as SeasonInviteRecord["status"],
    label: row.label as string | null,
    created_by_user_id: Number(row.created_by_user_id),
    claimed_by_user_id: row.claimed_by_user_id ? Number(row.claimed_by_user_id) : null,
    claimed_at: (row.claimed_at as Date | null) ?? null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date
  };
}

export async function listPlaceholderInvites(
  client: DbClient,
  seasonId: number
): Promise<SeasonInviteRecord[]> {
  const { rows } = await query(
    client,
    `SELECT
       id,
       season_id,
       intended_user_id,
       token_hash,
       kind,
       status,
       label,
       created_by_user_id,
       claimed_by_user_id,
       claimed_at,
       created_at,
       updated_at
     FROM season_invite
     WHERE season_id = $1 AND kind = 'PLACEHOLDER'
     ORDER BY created_at DESC`,
    [seasonId]
  );
  return rows.map(mapInvite);
}

export async function getPlaceholderInviteById(
  client: DbClient,
  seasonId: number,
  inviteId: number
): Promise<SeasonInviteRecord | null> {
  const { rows } = await query(
    client,
    `SELECT
       id,
       season_id,
       intended_user_id,
       token_hash,
       kind,
       status,
       label,
       created_by_user_id,
       claimed_by_user_id,
       claimed_at,
       created_at,
       updated_at
     FROM season_invite
     WHERE id = $1 AND season_id = $2 AND kind = 'PLACEHOLDER'`,
    [inviteId, seasonId]
  );
  return rows[0] ? mapInvite(rows[0]) : null;
}

export async function getPlaceholderInviteByTokenHash(
  client: DbClient,
  tokenHash: string
): Promise<SeasonInviteRecord | null> {
  const { rows } = await query(
    client,
    `SELECT
       id,
       season_id,
       intended_user_id,
       token_hash,
       kind,
       status,
       label,
       created_by_user_id,
       claimed_by_user_id,
       claimed_at,
       created_at,
       updated_at
     FROM season_invite
     WHERE kind = 'PLACEHOLDER' AND token_hash = $1`,
    [tokenHash]
  );
  return rows[0] ? mapInvite(rows[0]) : null;
}

export async function createPlaceholderInvite(
  client: DbClient,
  input: {
    season_id: number;
    token_hash: string;
    label: string | null;
    created_by_user_id: number;
  }
): Promise<SeasonInviteRecord> {
  const { rows } = await query(
    client,
    `INSERT INTO season_invite
       (season_id, token_hash, kind, status, label, created_by_user_id)
     VALUES ($1, $2, 'PLACEHOLDER', 'PENDING', $3, $4)
     RETURNING
       id,
       season_id,
       intended_user_id,
       token_hash,
       kind,
       status,
       label,
       created_by_user_id,
       claimed_by_user_id,
       claimed_at,
       created_at,
       updated_at`,
    [input.season_id, input.token_hash, input.label, input.created_by_user_id]
  );
  return mapInvite(rows[0]);
}

export async function revokePendingPlaceholderInvite(
  client: DbClient,
  seasonId: number,
  inviteId: number
): Promise<SeasonInviteRecord | null> {
  const { rows } = await query(
    client,
    `UPDATE season_invite
     SET status = 'REVOKED'
     WHERE id = $1 AND season_id = $2 AND kind = 'PLACEHOLDER' AND status = 'PENDING'
     RETURNING
       id,
       season_id,
       intended_user_id,
       token_hash,
       kind,
       status,
       label,
       created_by_user_id,
       claimed_by_user_id,
       claimed_at,
       created_at,
       updated_at`,
    [inviteId, seasonId]
  );
  return rows[0] ? mapInvite(rows[0]) : null;
}

export async function updatePlaceholderInviteLabel(
  client: DbClient,
  seasonId: number,
  inviteId: number,
  label: string | null
): Promise<SeasonInviteRecord | null> {
  const { rows } = await query(
    client,
    `UPDATE season_invite
     SET label = $3
     WHERE id = $1 AND season_id = $2 AND kind = 'PLACEHOLDER' AND status = 'PENDING'
     RETURNING
       id,
       season_id,
       intended_user_id,
       token_hash,
       kind,
       status,
       label,
       created_by_user_id,
       claimed_by_user_id,
       claimed_at,
       created_at,
       updated_at`,
    [inviteId, seasonId, label]
  );
  return rows[0] ? mapInvite(rows[0]) : null;
}

export async function markPlaceholderInviteClaimed(
  client: DbClient,
  inviteId: number,
  userId: number,
  claimedAt: Date
): Promise<SeasonInviteRecord | null> {
  const { rows } = await query(
    client,
    `UPDATE season_invite
     SET status = 'CLAIMED',
         claimed_by_user_id = $2,
         claimed_at = $3
     WHERE id = $1 AND kind = 'PLACEHOLDER' AND status = 'PENDING'
     RETURNING
       id,
       season_id,
       intended_user_id,
       token_hash,
       kind,
       status,
       label,
       created_by_user_id,
       claimed_by_user_id,
       claimed_at,
       created_at,
       updated_at`,
    [inviteId, userId, claimedAt]
  );
  return rows[0] ? mapInvite(rows[0]) : null;
}

export async function findPendingUserInvite(
  client: DbClient,
  seasonId: number,
  userId: number
): Promise<SeasonInviteRecord | null> {
  const { rows } = await query(
    client,
    `SELECT
       id,
       season_id,
       intended_user_id,
       token_hash,
       kind,
       status,
       label,
       created_by_user_id,
       claimed_by_user_id,
       claimed_at,
       created_at,
       updated_at
     FROM season_invite
     WHERE season_id = $1
       AND intended_user_id = $2
       AND kind = 'USER_TARGETED'
       AND status = 'PENDING'`,
    [seasonId, userId]
  );
  return rows[0] ? mapInvite(rows[0]) : null;
}

export async function createUserTargetedInvite(
  client: DbClient,
  input: {
    season_id: number;
    intended_user_id: number;
    created_by_user_id: number;
  }
): Promise<{ invite: SeasonInviteRecord; created: boolean }> {
  const existing = await findPendingUserInvite(
    client,
    input.season_id,
    input.intended_user_id
  );
  if (existing) return { invite: existing, created: false };

  try {
    const { rows } = await query(
      client,
      `INSERT INTO season_invite
         (season_id, intended_user_id, kind, status, created_by_user_id)
       VALUES ($1, $2, 'USER_TARGETED', 'PENDING', $3)
       RETURNING
         id,
         season_id,
         intended_user_id,
         token_hash,
         kind,
         status,
         label,
         created_by_user_id,
         claimed_by_user_id,
         claimed_at,
         created_at,
         updated_at`,
      [input.season_id, input.intended_user_id, input.created_by_user_id]
    );
    return { invite: mapInvite(rows[0]), created: true };
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      const retry = await findPendingUserInvite(
        client,
        input.season_id,
        input.intended_user_id
      );
      if (retry) return { invite: retry, created: false };
    }
    throw err;
  }
}

export async function listPendingUserInvitesForUser(
  client: DbClient,
  userId: number
): Promise<SeasonInviteRecord[]> {
  const { rows } = await query(
    client,
    `SELECT
       id,
       season_id,
       intended_user_id,
       token_hash,
       kind,
       status,
       label,
       created_by_user_id,
       claimed_by_user_id,
       claimed_at,
       created_at,
       updated_at
     FROM season_invite
     WHERE intended_user_id = $1
       AND kind = 'USER_TARGETED'
       AND status = 'PENDING'
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows.map(mapInvite);
}

export async function updateUserInviteStatus(
  client: DbClient,
  inviteId: number,
  userId: number,
  status: "CLAIMED" | "DECLINED",
  claimedAt: Date
): Promise<SeasonInviteRecord | null> {
  const { rows } = await query(
    client,
    `UPDATE season_invite
     SET status = $3,
         claimed_by_user_id = $2,
         claimed_at = $4
     WHERE id = $1
       AND intended_user_id = $2
       AND kind = 'USER_TARGETED'
       AND status = 'PENDING'
     RETURNING
       id,
       season_id,
       intended_user_id,
       token_hash,
       kind,
       status,
       label,
       created_by_user_id,
       claimed_by_user_id,
       claimed_at,
       created_at,
       updated_at`,
    [inviteId, userId, status, claimedAt]
  );
  return rows[0] ? mapInvite(rows[0]) : null;
}
