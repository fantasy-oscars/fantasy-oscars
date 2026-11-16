import { query, type DbClient } from "../db.js";

export type UserCredentials = { password_hash: string; password_algo: string };

export async function getLiveUserCredentials(
  db: DbClient,
  userId: number
): Promise<UserCredentials | null> {
  const { rows } = await query<UserCredentials>(
    db,
    `SELECT p.password_hash, p.password_algo
     FROM auth_password p
     JOIN app_user u ON u.id = p.user_id
     WHERE p.user_id = $1
       AND u.deleted_at IS NULL`,
    [userId]
  );
  return rows[0] ?? null;
}

/**
 * Takes the user row first, matching the lock order of login and account
 * deletion (app_user, then auth_password). False when the user is deleted.
 */
export async function lockLiveUser(db: DbClient, userId: number): Promise<boolean> {
  const { rows } = await query(
    db,
    `SELECT 1
     FROM app_user
     WHERE id = $1
       AND deleted_at IS NULL
     FOR KEY SHARE`,
    [userId]
  );
  return rows.length > 0;
}

/**
 * Stores a new scrypt hash. With `expectedHash`, only replaces that hash and
 * returns false when the password changed in the meantime.
 */
export async function setUserPassword(
  db: DbClient,
  input: { userId: number; passwordHash: string; expectedHash?: string }
): Promise<boolean> {
  if (input.expectedHash !== undefined) {
    const { rowCount } = await query(
      db,
      `UPDATE auth_password
       SET password_hash = $2,
           password_algo = 'scrypt',
           password_set_at = now()
       WHERE user_id = $1
         AND password_hash = $3`,
      [input.userId, input.passwordHash, input.expectedHash]
    );
    return (rowCount ?? 0) > 0;
  }
  await query(
    db,
    `INSERT INTO auth_password (user_id, password_hash, password_algo, password_set_at)
     VALUES ($1, $2, 'scrypt', now())
     ON CONFLICT (user_id) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           password_algo = 'scrypt',
           password_set_at = now()`,
    [input.userId, input.passwordHash]
  );
  return true;
}

export async function updateUserEmail(
  db: DbClient,
  input: { userId: number; email: string }
): Promise<void> {
  await query(
    db,
    `UPDATE app_user
     SET email = $2
     WHERE id = $1
       AND deleted_at IS NULL`,
    [input.userId, input.email]
  );
}
