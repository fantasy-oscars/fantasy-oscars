import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, runInTransaction, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";
import {
  buildTmdbImageUrlFromConfig,
  fetchTmdbMovieDetailsWithCredits,
  getTmdbImageConfig,
  parseReleaseYear
} from "../../lib/tmdb.js";

export function registerAdminFilmLinkRoutes(args: { router: Router; client: DbClient }) {
  const { router, client } = args;

  router.patch(
    "/films/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid film id");
        }

        const tmdbIdRaw = (req.body as { tmdb_id?: unknown } | undefined)?.tmdb_id;
        const tmdbId =
          tmdbIdRaw === null || tmdbIdRaw === undefined
            ? null
            : typeof tmdbIdRaw === "number"
              ? tmdbIdRaw
              : typeof tmdbIdRaw === "string" && tmdbIdRaw.trim()
                ? Number(tmdbIdRaw)
                : NaN;

        if (tmdbId !== null && (!Number.isInteger(tmdbId) || tmdbId <= 0)) {
          throw new AppError("VALIDATION_FAILED", 400, "tmdb_id must be a positive integer", {
            fields: ["tmdb_id"]
          });
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows: existingRows } = await query<{
            id: number;
            title: string;
            release_year: number | null;
            tmdb_id: number | null;
          }>(
            tx,
            `SELECT id::int, title, release_year::int, tmdb_id::int
             FROM film
             WHERE id = $1`,
            [id]
          );
          const existing = existingRows[0];
          if (!existing) throw new AppError("NOT_FOUND", 404, "Film not found");

          if (tmdbId === null) {
            const { rows } = await query(
              tx,
              `UPDATE film
               SET tmdb_id = NULL,
                   external_ids = NULL,
                   poster_path = NULL,
                   poster_url = NULL,
                   tmdb_last_synced_at = NULL,
                   tmdb_credits = NULL
               WHERE id = $1
               RETURNING id::int, title, release_year::int, tmdb_id::int, poster_url`,
              [id]
            );
            return { film: rows[0], hydrated: false };
          }

          // Hydrate details + credits from TMDB and store them on the film record.
          const cfg = await getTmdbImageConfig();
          const movie = await fetchTmdbMovieDetailsWithCredits(Number(tmdbId));
          const releaseYear = parseReleaseYear(movie.release_date ?? null);
          const posterPath = movie.poster_path ?? null;
          const posterUrl = buildTmdbImageUrlFromConfig(cfg, "poster", posterPath, "w500");
          const credits = movie.credits
            ? {
                cast: Array.isArray(movie.credits.cast)
                  ? movie.credits.cast.map((c) => ({
                      tmdb_id: c.id,
                      name: c.name,
                      character: c.character ?? null,
                      order: c.order ?? null,
                      credit_id: c.credit_id ?? null,
                      profile_path: c.profile_path ?? null
                    }))
                  : [],
                crew: Array.isArray(movie.credits.crew)
                  ? movie.credits.crew.map((c) => ({
                      tmdb_id: c.id,
                      name: c.name,
                      department: c.department ?? null,
                      job: c.job ?? null,
                      credit_id: c.credit_id ?? null,
                      profile_path: c.profile_path ?? null
                    }))
                  : []
              }
            : null;

          let rows: unknown[] = [];
          try {
            ({ rows } = await query(
              tx,
              `UPDATE film
               SET tmdb_id = $2::int,
                   external_ids = COALESCE(external_ids, '{}'::jsonb) || jsonb_build_object('tmdb_id', $2::int),
                   title = $3,
                   release_year = $4,
                   poster_path = $5,
                   poster_url = $6,
                   tmdb_last_synced_at = now(),
                   tmdb_credits = $7
               WHERE id = $1
               RETURNING id::int, title, release_year::int, tmdb_id::int, poster_url`,
              [
                id,
                Number(tmdbId),
                movie.title,
                releaseYear,
                posterPath,
                posterUrl,
                credits ? JSON.stringify(credits) : null
              ]
            ));
          } catch (err) {
            // Friendly feedback for a common admin mistake: trying to link the same TMDB id twice.
            const pg = err as { code?: unknown; constraint?: unknown };
            if (pg?.code === "23505" && pg?.constraint === "film_tmdb_id_key") {
              const { rows: dupeRows } = await query<{
                id: number;
                title: string;
              }>(
                tx,
                `SELECT id::int, title
                 FROM film
                 WHERE tmdb_id = $1::int
                 ORDER BY id ASC
                 LIMIT 1`,
                [Number(tmdbId)]
              );
              const dupe = dupeRows[0];
              throw new AppError(
                "TMDB_ID_ALREADY_LINKED",
                409,
                dupe?.title
                  ? `That TMDB id is already linked to “${dupe.title}”.`
                  : "That TMDB id is already linked to another film.",
                dupe
                  ? {
                      tmdb_id: Number(tmdbId),
                      linked_film_id: dupe.id,
                      linked_film_title: dupe.title
                    }
                  : { tmdb_id: Number(tmdbId) }
              );
            }
            throw err;
          }
          return { film: rows[0], hydrated: true };
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "link_film_tmdb",
            target_type: "film",
            target_id: id,
            meta: { tmdb_id: tmdbId, hydrated: result.hydrated }
          });
        }

        return res.status(200).json({ film: result.film, hydrated: result.hydrated });
      } catch (err) {
        next(err);
      }
    }
  );
}

