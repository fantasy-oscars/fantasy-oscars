import type { Router } from "express";
import { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query } from "../../data/db.js";

export function registerAdminPeopleListRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.get("/people", async (req: AuthedRequest, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const like = q ? `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%` : null;
      const { rows } = await query(
        client,
        `SELECT id::int, full_name, tmdb_id::int, profile_url
         FROM person
         WHERE ($1::text IS NULL OR full_name ILIKE $1 ESCAPE '\\')
         ORDER BY full_name ASC, id ASC
         LIMIT 250`,
        [like]
      );
      return res.status(200).json({ people: rows });
    } catch (err) {
      next(err);
    }
  });
}
