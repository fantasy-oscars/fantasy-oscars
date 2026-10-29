import type express from "express";
import { requireAuth, type AuthedRequest } from "../../auth/middleware.js";
import { normalizeAdminRole } from "../../auth/roles.js";
import type { DbClient } from "../../data/db.js";
import { query } from "../../data/db.js";

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

      const { rows } = await query(
        client,
        `SELECT id::text AS sub, username, email, is_admin, admin_role, avatar_key
         FROM app_user
         WHERE id = $1
           AND deleted_at IS NULL`,
        [userId]
      );
      const user = rows[0] as
        | undefined
        | {
            sub: string;
            username?: string;
            email?: string;
            is_admin?: boolean;
            admin_role?: string | null;
            avatar_key?: string | null;
          };

      if (!user) return res.json({ user: req.auth });

      const adminRole = normalizeAdminRole(user.admin_role, Boolean(user.is_admin));

      return res.json({
        user: {
          sub: user.sub,
          username: user.username ?? req.auth?.username,
          email: user.email,
          is_admin: adminRole !== "NONE",
          admin_role: adminRole,
          avatar_key: user.avatar_key ?? req.auth?.avatar_key ?? "monkey"
        }
      });
    } catch (err) {
      next(err);
    }
  });
}
