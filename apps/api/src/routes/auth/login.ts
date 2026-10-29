import type express from "express";
import {
  normalizeUsername,
  validatePassword,
  validateUsername
} from "@fantasy-oscars/shared";
import type { Pool } from "pg";
import { query, runInTransaction, type DbClient } from "../../data/db.js";
import { AppError, validationError } from "../../errors.js";
import { setAuthCookie, type AuthCookieConfig } from "../../auth/cookie.js";
import { signSessionToken } from "../../auth/token.js";
import { normalizeAdminRole } from "../../auth/roles.js";
import { createAuthSession } from "../../data/repositories/authSessionRepository.js";
import { AUTH_SESSION_TTL_MS } from "../../domain/authSession.js";
import { hashPassword, verifyPassword } from "./password.js";

export function registerAuthLoginRoute(args: {
  router: express.Router;
  client: DbClient;
  authSecret: string;
  cookieConfig: AuthCookieConfig;
  loginLimiters: Array<{ middleware: express.RequestHandler }>;
}) {
  const { router, client, authSecret, cookieConfig, loginLimiters } = args;

  router.post(
    "/login",
    ...loginLimiters.map((l) => l.middleware),
    async (req, res, next) => {
      try {
        const { username, handle, password } = req.body ?? {};
        const rawUsername = username ?? handle;
        if (!rawUsername || !password) {
          throw validationError("Missing required fields", ["username", "password"]);
        }
        if (typeof rawUsername !== "string" || typeof password !== "string") {
          throw validationError("Invalid field types", ["username", "password"]);
        }
        const usernameIssues = validateUsername(rawUsername).filter(
          (i) => i.code !== "REQUIRED"
        );
        const passwordIssues = validatePassword(password).filter(
          (i) => i.code !== "REQUIRED"
        );
        if (usernameIssues.length || passwordIssues.length) {
          throw validationError("Invalid credentials", ["username", "password"]);
        }

        const normalizedUsername = normalizeUsername(rawUsername);
        const { rows } = await query(
          client,
          `SELECT u.id, u.username, u.email, u.is_admin, u.admin_role, u.avatar_key, p.password_hash, p.password_algo
           FROM app_user u
           JOIN auth_password p ON p.user_id = u.id
           WHERE lower(u.username) = $1
             AND u.deleted_at IS NULL`,
          [normalizedUsername]
        );

        const user = rows[0] as {
          id: string | number;
          username: string;
          email: string;
          is_admin: boolean;
          admin_role?: string | null;
          avatar_key?: string | null;
          password_hash: string;
          password_algo: string;
        };
        if (!user) throw new AppError("INVALID_CREDENTIALS", 401, "Invalid credentials");

        const isValid = await verifyPassword(
          password,
          user.password_hash,
          user.password_algo
        );
        if (!isValid) {
          throw new AppError("INVALID_CREDENTIALS", 401, "Invalid credentials");
        }

        // Hash outside the transaction; scrypt is slow.
        const upgradedHash =
          user.password_algo === "sha256" ? await hashPassword(password) : null;

        const session = await runInTransaction(client as Pool, async (tx) => {
          // Take the user row first so lock order matches account deletion
          // (app_user, then auth_password); also refuses a login that races
          // a deletion.
          const { rows: liveUser } = await query(
            tx,
            `SELECT 1
             FROM app_user
             WHERE id = $1
               AND deleted_at IS NULL
             FOR KEY SHARE`,
            [user.id]
          );
          if (!liveUser[0]) {
            throw new AppError("INVALID_CREDENTIALS", 401, "Invalid credentials");
          }
          // Lock the password row as verified. If a reset changed it meanwhile,
          // refuse; if a reset starts after this, it waits for the commit and
          // then revokes the session created here.
          const { rows: locked } = await query(
            tx,
            `SELECT 1
             FROM auth_password
             WHERE user_id = $1
               AND password_hash = $2
             FOR UPDATE`,
            [user.id, user.password_hash]
          );
          if (!locked[0]) {
            throw new AppError("INVALID_CREDENTIALS", 401, "Invalid credentials");
          }
          // Upgrade legacy unsalted hashes now that we hold the plaintext.
          if (upgradedHash) {
            await query(
              tx,
              `UPDATE auth_password
               SET password_hash = $3,
                   password_algo = 'scrypt',
                   password_set_at = now()
               WHERE user_id = $1
                 AND password_algo = 'sha256'
                 AND password_hash = $2`,
              [user.id, user.password_hash, upgradedHash]
            );
          }
          return createAuthSession(tx, {
            userId: Number(user.id),
            ttlMs: AUTH_SESSION_TTL_MS
          });
        });
        const expiresAt = new Date(session.expires_at);
        const avatarKey = String(user.avatar_key ?? "monkey");
        const adminRole = normalizeAdminRole(user.admin_role, Boolean(user.is_admin));
        const token = signSessionToken(
          {
            sub: String(user.id),
            username: user.username,
            is_admin: adminRole !== "NONE",
            admin_role: adminRole,
            avatar_key: avatarKey,
            sid: session.id
          },
          authSecret,
          expiresAt
        );
        setAuthCookie(res, token, expiresAt, cookieConfig);
        return res.json({
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            is_admin: adminRole !== "NONE",
            admin_role: adminRole,
            avatar_key: avatarKey
          },
          token
        });
      } catch (err) {
        next(err);
      }
    }
  );
}
