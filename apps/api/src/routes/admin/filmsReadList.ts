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
        const yearRaw = typeof req.query.year === "string" ? req.query.year.trim() : "";
        const yearNum = yearRaw ? Number(yearRaw) : null;
        const year = Number.isInteger(yearNum) ? yearNum : null;
        const linked =
          typeof req.query.linked === "string" ? req.query.linked.trim().toLowerCase() : "";
        const nominated =
          typeof req.query.nominated === "string"
            ? req.query.nominated.trim().toLowerCase()
            : "";
        const linkedFilter =
          linked === "linked" || linked === "unlinked" ? linked : "all";
        const nominatedFilter =
          nominated === "nominated" || nominated === "not_nominated" ? nominated : "all";

        const distinctYearsRes = await query<{ release_year: number }>(
          client,
          `SELECT DISTINCT release_year::int
           FROM film
           WHERE release_year IS NOT NULL
           ORDER BY release_year DESC`
        );
        const years = distinctYearsRes.rows.map((r) => Number(r.release_year));

        const { rows } = await query(
          client,
          `WITH film_rows AS (
             SELECT
               f.id::int AS id,
               f.title,
               f.release_year::int,
               f.tmdb_id::int,
               f.poster_url,
               EXISTS (
                 SELECT 1
                 FROM nomination n
                 LEFT JOIN song s ON s.id = n.song_id
                 LEFT JOIN performance p ON p.id = n.performance_id
                 WHERE n.status = 'ACTIVE'
                   AND COALESCE(n.film_id, s.film_id, p.film_id) = f.id
               ) AS is_nominated
             FROM film f
           )
           SELECT
             id,
             title,
             release_year,
             tmdb_id,
             poster_url,
             is_nominated
           FROM film_rows
           WHERE ($1::text IS NULL OR title ILIKE $1 ESCAPE '\\')
             AND ($2::int IS NULL OR release_year = $2)
             AND (
               $3::text = 'all'
               OR ($3::text = 'linked' AND tmdb_id IS NOT NULL)
               OR ($3::text = 'unlinked' AND tmdb_id IS NULL)
             )
             AND (
               $4::text = 'all'
               OR ($4::text = 'nominated' AND is_nominated = TRUE)
               OR ($4::text = 'not_nominated' AND is_nominated = FALSE)
             )
           ORDER BY title ASC, release_year DESC NULLS LAST, id ASC
           LIMIT 500`,
          [like, year, linkedFilter, nominatedFilter]
        );
        return res.status(200).json({ films: rows, years });
      } catch (err) {
        next(err);
      }
    }
  );
}
