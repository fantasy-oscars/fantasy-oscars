import { query, type DbClient } from "../db.js";

/** The live account using this address (stored lower-cased; compared case-insensitively). */
export async function findLiveUserIdByEmail(
  db: DbClient,
  email: string
): Promise<number | null> {
  const { rows } = await query<{ id: number }>(
    db,
    `SELECT id::int
     FROM app_user
     WHERE lower(email) = lower($1)
       AND deleted_at IS NULL`,
    [email]
  );
  return rows[0]?.id ?? null;
}

/** Removes the user's unused reset tokens, so only the newest link (if any) works. */
export async function deleteUnusedResetTokens(
  db: DbClient,
  userId: number
): Promise<void> {
  await query(
    db,
    `DELETE FROM password_reset_token
     WHERE user_id = $1
       AND used_at IS NULL`,
    [userId]
  );
}

export async function insertResetToken(
  db: DbClient,
  input: { userId: number; tokenHash: string; createdAt: Date; expiresAt: Date }
): Promise<void> {
  await query(
    db,
    `INSERT INTO password_reset_token (user_id, token_hash, created_at, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [input.userId, input.tokenHash, input.createdAt, input.expiresAt]
  );
}

/** The owner of an unused, unexpired token, without consuming it. */
export async function findUsableResetTokenUserId(
  db: DbClient,
  input: { tokenHash: string; now: Date }
): Promise<number | null> {
  const { rows } = await query<{ user_id: number }>(
    db,
    `SELECT user_id::int
     FROM password_reset_token
     WHERE token_hash = $1
       AND used_at IS NULL
       AND expires_at > $2`,
    [input.tokenHash, input.now]
  );
  return rows[0]?.user_id ?? null;
}

/**
 * Marks the token used if it is unused, unexpired and belongs to a live user.
 * Returns the user id, or null when the token cannot be used. Single statement,
 * so two concurrent confirmations cannot both succeed.
 */
export async function consumeResetToken(
  db: DbClient,
  input: { tokenHash: string; now: Date }
): Promise<number | null> {
  const { rows } = await query<{ user_id: number }>(
    db,
    `UPDATE password_reset_token t
     SET used_at = $2
     FROM app_user u
     WHERE t.token_hash = $1
       AND t.used_at IS NULL
       AND t.expires_at > $2
       AND u.id = t.user_id
       AND u.deleted_at IS NULL
     RETURNING t.user_id::int AS user_id`,
    [input.tokenHash, input.now]
  );
  return rows[0]?.user_id ?? null;
}
