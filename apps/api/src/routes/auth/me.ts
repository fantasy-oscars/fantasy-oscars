import type express from "express";
import { requireAuth, type AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { query } from "../../data/db.js";
import { isMissingColumnError } from "./pgErrors.js";

export function registerAuthMeRoute(args: {
  router: express.Router;
  client: DbClient;
  authSecret: string;
}) {
  const { router, client, authSecret } = args;

  router.get("/me", requireAuth(authSecret), async (req: AuthedRequest, res, next) => {
    try {
      const userId = req.auth?.sub;
      if (!userId) return res.json({ user: req.auth });

      const tryQueries: Array<() => Promise<unknown[]>> = [
        async () =>
          (
            await query(
              client,
              `SELECT id::text AS sub, username, email, is_admin, avatar_key
               FROM app_user
               WHERE id = $1`,
              [userId]
            )
          ).rows as unknown[],
        async () =>
          (
            await query(
              client,
              `SELECT id::text AS sub, username, email, is_admin
               FROM app_user
               WHERE id = $1`,
              [userId]
            )
          ).rows as unknown[],
        async () =>
          (
            await query(
              client,
              `SELECT id::text AS sub, handle AS username, email, is_admin
               FROM app_user
               WHERE id = $1`,
              [userId]
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
          if (
            !isMissingColumnError(err, "avatar_key") &&
            !isMissingColumnError(err, "username") &&
            !isMissingColumnError(err, "handle") &&
            !isMissingColumnError(err, "is_admin")
          ) {
            break;
          }
        }
      }

      if (!rows) throw lastErr;
      const user = rows[0] as
        | undefined
        | {
            sub: string;
            username?: string;
            email?: string;
            is_admin?: boolean;
            avatar_key?: string | null;
          };

      if (!user) return res.json({ user: req.auth });

      return res.json({
        user: {
          sub: user.sub,
          username: user.username ?? req.auth?.username,
          email: user.email,
          is_admin: user.is_admin ?? req.auth?.is_admin,
          avatar_key: user.avatar_key ?? req.auth?.avatar_key ?? "monkey"
        }
      });
    } catch (err) {
      next(err);
    }
  });
}

