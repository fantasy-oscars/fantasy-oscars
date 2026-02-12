import type { Router } from "express";
import { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query } from "../../data/db.js";
import { escapeLike, normalizeForSearch, sqlNorm } from "../../domain/search.js";

export function registerAdminUsersListRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.get("/users", async (req: AuthedRequest, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (!q) return res.status(200).json({ users: [] });

      const likeRaw = `%${escapeLike(q)}%`;
      const likeNorm = `%${escapeLike(normalizeForSearch(q))}%`;
      const { rows } = await query(
        client,
        `SELECT id::int, username, email, is_admin, created_at
           FROM app_user
           WHERE username ILIKE $1 ESCAPE '\\'
              OR email ILIKE $1 ESCAPE '\\'
              OR ${sqlNorm("username")} LIKE $2 ESCAPE '\\'
              OR ${sqlNorm("coalesce(email, '')")} LIKE $2 ESCAPE '\\'
           ORDER BY created_at DESC
           LIMIT 25`,
        [likeRaw, likeNorm]
      );
      return res.status(200).json({ users: rows });
    } catch (err) {
      next(err);
    }
  });
}
