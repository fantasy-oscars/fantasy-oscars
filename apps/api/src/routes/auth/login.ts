import type express from "express";
import {
  normalizeUsername,
  validatePassword,
  validateUsername
} from "@fantasy-oscars/shared";
import { query, type DbClient } from "../../data/db.js";
import { AppError, validationError } from "../../errors.js";
import { signToken } from "../../auth/token.js";
import { verifyPassword } from "./password.js";
import { isMissingColumnError } from "./pgErrors.js";
import type { AuthCookieConfig } from "./logout.js";

export function registerAuthLoginRoute(args: {
  router: express.Router;
  client: DbClient;
  authSecret: string;
  authCookieMaxAgeMs: number;
  cookieConfig: AuthCookieConfig;
  authLimiter: { middleware: express.RequestHandler };
}) {
  const { router, client, authSecret, authCookieMaxAgeMs, cookieConfig, authLimiter } =
    args;

  router.post("/login", authLimiter.middleware, async (req, res, next) => {
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
      const tryQueries: Array<() => Promise<unknown[]>> = [
        async () =>
          (
            await query(
              client,
              `SELECT u.id, u.username, u.email, u.is_admin, u.avatar_key, p.password_hash, p.password_algo
               FROM app_user u
               JOIN auth_password p ON p.user_id = u.id
               WHERE lower(u.username) = $1`,
              [normalizedUsername]
            )
          ).rows as unknown[],
        async () =>
          (
            await query(
              client,
              `SELECT u.id, u.username, u.email, false AS is_admin, u.avatar_key, p.password_hash, p.password_algo
               FROM app_user u
               JOIN auth_password p ON p.user_id = u.id
               WHERE lower(u.username) = $1`,
              [normalizedUsername]
            )
          ).rows as unknown[],
        async () =>
          (
            await query(
              client,
              `SELECT u.id, u.handle AS username, u.email, u.is_admin, p.password_hash, p.password_algo
               FROM app_user u
               JOIN auth_password p ON p.user_id = u.id
               WHERE lower(u.handle) = $1`,
              [normalizedUsername]
            )
          ).rows as unknown[],
        async () =>
          (
            await query(
              client,
              `SELECT u.id, u.handle AS username, u.email, false AS is_admin, p.password_hash, p.password_algo
               FROM app_user u
               JOIN auth_password p ON p.user_id = u.id
               WHERE lower(u.handle) = $1`,
              [normalizedUsername]
            )
          ).rows as unknown[]
      ];

      let rows: unknown[] | undefined;
      let lastErr: unknown = undefined;
      for (const run of tryQueries) {
        try {
          rows = await run();
          break;
        } catch (err) {
          lastErr = err;
          // Only continue retrying on missing-column errors.
          if (
            !isMissingColumnError(err, "is_admin") &&
            !isMissingColumnError(err, "username") &&
            !isMissingColumnError(err, "handle") &&
            !isMissingColumnError(err, "avatar_key")
          ) {
            break;
          }
        }
      }
      if (!rows) {
        if (
          isMissingColumnError(lastErr, "username") ||
          isMissingColumnError(lastErr, "handle") ||
          isMissingColumnError(lastErr, "is_admin") ||
          isMissingColumnError(lastErr, "avatar_key")
        ) {
          throw new AppError(
            "SERVICE_UNAVAILABLE",
            503,
            "Login is temporarily unavailable while we update the server. Please try again in a few minutes."
          );
        }
        throw lastErr;
      }

      const user = rows[0] as {
        id: string | number;
        username: string;
        email: string;
        is_admin: boolean;
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

      // Skeleton: return placeholder token (non-secure) for v0.
      const avatarKey = String(user.avatar_key ?? "monkey");
      const token = signToken(
        {
          sub: String(user.id),
          username: user.username,
          is_admin: user.is_admin,
          avatar_key: avatarKey
        },
        authSecret,
        Math.floor(authCookieMaxAgeMs / 1000)
      );
      res.cookie(cookieConfig.name, token, {
        httpOnly: cookieConfig.httpOnly,
        sameSite: cookieConfig.sameSite,
        secure: cookieConfig.secure,
        maxAge: authCookieMaxAgeMs,
        path: cookieConfig.path
      });
      return res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          is_admin: user.is_admin,
          avatar_key: avatarKey
        },
        token
      });
    } catch (err) {
      next(err);
    }
  });
}

