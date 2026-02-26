import type express from "express";
import type { Router } from "express";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, type DbClient } from "../../data/db.js";
import { escapeLike, normalizeForSearch, sqlNorm } from "../../domain/search.js";

export function registerAdminFilmDuplicatesListRoute(args: {
  router: Router;
  client: DbClient;
}): void {
  const { router, client } = args;

  router.get(
    "/films/duplicates",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        const likeRaw = q ? `%${escapeLike(q)}%` : null;
        const likeNorm = q ? `%${escapeLike(normalizeForSearch(q))}%` : null;

        const { rows } = await query<{
          norm_title: string;
          count: number;
          films: Array<{
            id: number;
            title: string;
            release_year: number | null;
            tmdb_id: number | null;
            poster_url: string | null;
            tmdb_last_synced_at: string | null;
          }>;
        }>(
          client,
           `WITH f AS (
             SELECT
               id::int,
               title,
               release_year::int,
               tmdb_id::int,
               poster_url,
               tmdb_last_synced_at,
               ${sqlNorm("title")} AS norm_title
             FROM film
             WHERE consolidated_into_film_id IS NULL
           )
           SELECT
             norm_title,
             count(*)::int AS count,
             json_agg(
               json_build_object(
                 'id', id,
                 'title', title,
                 'release_year', release_year,
                 'tmdb_id', tmdb_id,
                 'poster_url', poster_url,
                 'tmdb_last_synced_at', tmdb_last_synced_at
               )
               ORDER BY (tmdb_id IS NULL) ASC, tmdb_last_synced_at DESC NULLS LAST, id ASC
             ) AS films
           FROM f
           WHERE ($1::text IS NULL OR title ILIKE $1 ESCAPE '\\' OR norm_title LIKE $2 ESCAPE '\\')
           GROUP BY norm_title
           HAVING count(*) > 1
           ORDER BY max(tmdb_last_synced_at) DESC NULLS LAST, min(id) ASC
           LIMIT 200`,
          [likeRaw, likeNorm]
        );

        return res.status(200).json({ groups: rows });
      } catch (err) {
        next(err);
      }
    }
  );
}
