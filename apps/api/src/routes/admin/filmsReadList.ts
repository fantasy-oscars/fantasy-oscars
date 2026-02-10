import type express from "express";
import type { Router } from "express";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, type DbClient } from "../../data/db.js";

export function registerAdminFilmsListRoute(args: {
  router: Router;
  client: DbClient;
}): void {
  const { router, client } = args;

  router.get(
    "/films",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        const like = q ? `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%` : null;
        const { rows } = await query(
          client,
          `SELECT
             id::int,
             title,
             release_year::int,
             tmdb_id::int,
             poster_url
           FROM film
           WHERE ($1::text IS NULL OR title ILIKE $1 ESCAPE '\\')
           ORDER BY title ASC, release_year DESC NULLS LAST, id ASC
           LIMIT 500`,
          [like]
        );
        return res.status(200).json({ films: rows });
      } catch (err) {
        next(err);
      }
    }
  );
}

