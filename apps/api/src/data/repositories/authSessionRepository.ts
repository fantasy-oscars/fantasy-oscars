import crypto from "crypto";
import { query, type DbClient } from "../db.js";

export type ActiveSessionUser = {
  user_id: number;
  is_admin: boolean;
  admin_role: string | null;
  last_seen_at: Date;
  expires_at: Date;
};

export async function createAuthSession(
  db: DbClient,
  input: { userId: number; ttlMs: number }
): Promise<{ id: string; expires_at: Date }> {
  const id = crypto.randomBytes(32).toString("base64url");
  const { rows } = await query<{ id: string; expires_at: Date }>(
    db,
    `INSERT INTO auth_session (id, user_id, expires_at)
     VALUES ($1, $2, now() + $3::double precision * interval '1 millisecond')
     RETURNING id, expires_at`,
    [id, input.userId, input.ttlMs]
  );
  return rows[0]!;
}

/**
 * Loads the user behind a session in one round trip. Returns null when the
 * session is missing, revoked, expired, older than `maxAgeMs`, belongs to
 * another user, or the user has been deleted.
 */
export async function getActiveSessionUser(
  db: DbClient,
  input: { sessionId: string; userId: number; maxAgeMs: number }
): Promise<ActiveSessionUser | null> {
  const { rows } = await query<ActiveSessionUser>(
    db,
    `SELECT u.id::int AS user_id,
            u.is_admin,
            u.admin_role,
            s.last_seen_at,
            s.expires_at
     FROM auth_session s
     JOIN app_user u ON u.id = s.user_id
     WHERE s.id = $1
       AND s.user_id = $2
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
       AND s.created_at > now() - $3::double precision * interval '1 millisecond'
       AND u.deleted_at IS NULL`,
    [input.sessionId, input.userId, input.maxAgeMs]
  );
  return rows[0] ?? null;
}

/**
 * Slides the session expiry forward, never past `created_at + maxAgeMs`. Only writes when the session was last
 * renewed more than `renewAfterMs` ago, so concurrent requests renew once.
 * Returns the new expiry, or null when nothing was renewed.
 */
export async function renewAuthSession(
  db: DbClient,
  input: { sessionId: string; ttlMs: number; renewAfterMs: number; maxAgeMs: number }
): Promise<Date | null> {
  const { rows } = await query<{ expires_at: Date }>(
    db,
    `UPDATE auth_session
     SET last_seen_at = now(),
         expires_at = LEAST(
           now() + $2::double precision * interval '1 millisecond',
           created_at + $4::double precision * interval '1 millisecond'
         )
     WHERE id = $1
       AND revoked_at IS NULL
       AND expires_at > now()
       AND last_seen_at < now() - $3::double precision * interval '1 millisecond'
     RETURNING expires_at`,
    [input.sessionId, input.ttlMs, input.renewAfterMs, input.maxAgeMs]
  );
  return rows[0]?.expires_at ?? null;
}

export async function revokeAuthSession(
  db: DbClient,
  input: { sessionId: string; userId: number }
): Promise<void> {
  await query(
    db,
    `UPDATE auth_session
     SET revoked_at = now()
     WHERE id = $1
       AND user_id = $2
       AND revoked_at IS NULL`,
    [input.sessionId, input.userId]
  );
}

export async function revokeAllUserSessions(db: DbClient, userId: number): Promise<void> {
  await query(
    db,
    `UPDATE auth_session
     SET revoked_at = now()
     WHERE user_id = $1
       AND revoked_at IS NULL`,
    [userId]
  );
}
