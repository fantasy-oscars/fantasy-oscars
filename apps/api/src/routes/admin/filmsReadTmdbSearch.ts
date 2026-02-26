import type express from "express";
import type { Router } from "express";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, type DbClient } from "../../data/db.js";
import {
  buildTmdbImageUrlFromConfig,
  fetchTmdbMovieDetailsWithCredits,
  getTmdbImageConfig,
  parseReleaseYear,
  searchTmdbMovies
} from "../../lib/tmdb.js";

export function registerAdminFilmsTmdbSearchRoute(args: {
  router: Router;
  client: DbClient;
}): void {
  const { router, client } = args;

  router.get(
    "/films/tmdb-search",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        if (!q || q.length < 2) return res.status(200).json({ results: [] });

        const tmdbResults = (await searchTmdbMovies(q)).slice(0, 12);
        const tmdbIds = tmdbResults
          .map((r) => Number(r.id))
          .filter((id) => Number.isInteger(id) && id > 0);
        const linkedByTmdbId = new Map<number, { film_id: number; film_title: string }>();
        if (tmdbIds.length > 0) {
          const { rows } = await query<{
            film_id: number;
            film_title: string;
            tmdb_id: number;
          }>(
            client,
            `SELECT id::int AS film_id, title AS film_title, tmdb_id::int
             FROM film
             WHERE tmdb_id = ANY($1::int[])
             ORDER BY id ASC`,
            [tmdbIds]
          );
          for (const row of rows) {
            linkedByTmdbId.set(Number(row.tmdb_id), {
              film_id: Number(row.film_id),
              film_title: row.film_title
            });
          }
        }

        const cfg = await getTmdbImageConfig();
        const directorByTmdbId = new Map<number, string | null>();
        await Promise.all(
          tmdbResults.slice(0, 8).map(async (movie) => {
            try {
              const details = await fetchTmdbMovieDetailsWithCredits(Number(movie.id));
              const director =
                details.credits?.crew?.find((c) => c.job === "Director")?.name ?? null;
              directorByTmdbId.set(Number(movie.id), director);
            } catch {
              directorByTmdbId.set(Number(movie.id), null);
            }
          })
        );

        const results = tmdbResults.map((movie) => {
          const tmdbId = Number(movie.id);
          const linked = linkedByTmdbId.get(tmdbId) ?? null;
          return {
            tmdb_id: tmdbId,
            title: movie.title,
            original_title: movie.original_title ?? null,
            release_year: parseReleaseYear(movie.release_date ?? null),
            poster_url: buildTmdbImageUrlFromConfig(
              cfg,
              "poster",
              movie.poster_path ?? null,
              "w500"
            ),
            director: directorByTmdbId.get(tmdbId) ?? null,
            overview: movie.overview ?? null,
            linked_film_id: linked?.film_id ?? null,
            linked_film_title: linked?.film_title ?? null
          };
        });

        return res.status(200).json({ results });
      } catch (err) {
        next(err);
      }
    }
  );
}
