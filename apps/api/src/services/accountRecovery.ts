import crypto from "crypto";
import type { Pool } from "pg";
import { runInTransaction, type DbClient } from "../data/db.js";
import {
  getLiveUserCredentials,
  lockLiveUser,
  setUserPassword,
  updateUserEmail
} from "../data/repositories/authPasswordRepository.js";
import {
  revokeAllUserSessions,
  revokeOtherUserSessions
} from "../data/repositories/authSessionRepository.js";
import {
  consumeResetToken,
  deleteUnusedResetTokens,
  findLiveUserIdByEmail,
  findUsableResetTokenUserId,
  insertResetToken
} from "../data/repositories/passwordResetRepository.js";
import {
  buildPasswordResetLink,
  PASSWORD_RESET_TTL_MS
} from "../domain/passwordReset.js";
import { AppError } from "../errors.js";
import { hashPassword, verifyPassword } from "../auth/password.js";

/** SHA-256 of the raw token; the only form that is stored. */
export function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function invalidResetToken() {
  return new AppError(
    "INVALID_RESET_TOKEN",
    400,
    "This reset link is invalid or has expired. Ask for a new one."
  );
}

function invalidCurrentPassword() {
  return new AppError("INVALID_CURRENT_PASSWORD", 400, "Current password is incorrect", {
    fields: ["currentPassword"]
  });
}

export type PasswordResetDelivery = { userId: number; to: string; link: string };

/**
 * Issues a reset token when the address belongs to a live account. Returns what
 * to send, or null. The caller replies first and sends afterwards, so the
 * response does not reveal whether an email goes out.
 */
export async function requestPasswordReset(
  pool: Pool,
  input: { email: string; webBaseUrl: string; now?: Date }
): Promise<PasswordResetDelivery | null> {
  const now = input.now ?? new Date();
  // Generate the token either way to keep the work similar for unknown addresses.
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken(token);
  const userId = await findLiveUserIdByEmail(pool, input.email);
  if (userId === null) return null;

  await runInTransaction(pool, async (tx) => {
    await deleteUnusedResetTokens(tx, userId);
    await insertResetToken(tx, {
      userId,
      tokenHash,
      createdAt: now,
      expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS)
    });
  });
  return {
    userId,
    to: input.email,
    link: buildPasswordResetLink(input.webBaseUrl, token)
  };
}

/**
 * Sets a new password from a reset token, marks the token used and revokes
 * every session of the user, in one transaction. Does not sign the user in.
 */
export async function confirmPasswordReset(
  pool: Pool,
  input: { token: string; password: string; now?: Date }
): Promise<{ userId: number }> {
  const now = input.now ?? new Date();
  const tokenHash = hashResetToken(input.token);
  // Cheap check first so a bad token does not cost a scrypt hash.
  const ownerId = await findUsableResetTokenUserId(pool, { tokenHash, now });
  if (ownerId === null) throw invalidResetToken();

  const passwordHash = await hashPassword(input.password);
  return runInTransaction(pool, async (tx) => {
    if (!(await lockLiveUser(tx, ownerId))) throw invalidResetToken();
    const userId = await consumeResetToken(tx, { tokenHash, now });
    if (userId !== ownerId) throw invalidResetToken();
    await setUserPassword(tx, { userId, passwordHash });
    await deleteUnusedResetTokens(tx, userId);
    await revokeAllUserSessions(tx, userId);
    return { userId };
  });
}

async function verifyCurrentPassword(db: DbClient, userId: number, password: string) {
  const credentials = await getLiveUserCredentials(db, userId);
  if (!credentials) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");
  const ok = await verifyPassword(
    password,
    credentials.password_hash,
    credentials.password_algo
  );
  if (!ok) throw invalidCurrentPassword();
  return credentials;
}

/** Changes the password, keeps the current session and revokes the others. */
export async function changePassword(
  pool: Pool,
  input: {
    userId: number;
    sessionId: string;
    currentPassword: string;
    newPassword: string;
  }
): Promise<void> {
  const credentials = await verifyCurrentPassword(
    pool,
    input.userId,
    input.currentPassword
  );
  const passwordHash = await hashPassword(input.newPassword);
  await runInTransaction(pool, async (tx) => {
    if (!(await lockLiveUser(tx, input.userId))) {
      throw new AppError("UNAUTHORIZED", 401, "Missing auth token");
    }
    // Refuse when the password changed after it was verified above.
    const updated = await setUserPassword(tx, {
      userId: input.userId,
      passwordHash,
      expectedHash: credentials.password_hash
    });
    if (!updated) throw invalidCurrentPassword();
    await deleteUnusedResetTokens(tx, input.userId);
    await revokeOtherUserSessions(tx, {
      userId: input.userId,
      keepSessionId: input.sessionId
    });
  });
}

function isEmailConflict(err: unknown): boolean {
  const pgErr = err as { code?: string; constraint?: string };
  return (
    pgErr.code === "23505" &&
    (pgErr.constraint === "app_user_email_key" ||
      pgErr.constraint === "app_user_email_lower_key")
  );
}

/**
 * Changes the account email (no confirmation email, by design). Outstanding
 * reset links were sent to the old address, so they stop working.
 */
export async function changeEmail(
  pool: Pool,
  input: { userId: number; currentPassword: string; email: string }
): Promise<{ email: string }> {
  await verifyCurrentPassword(pool, input.userId, input.currentPassword);
  try {
    await runInTransaction(pool, async (tx) => {
      await updateUserEmail(tx, { userId: input.userId, email: input.email });
      await deleteUnusedResetTokens(tx, input.userId);
    });
  } catch (err) {
    if (isEmailConflict(err)) {
      throw new AppError("USER_EXISTS", 409, "User with username/email already exists");
    }
    throw err;
  }
  return { email: input.email };
}
