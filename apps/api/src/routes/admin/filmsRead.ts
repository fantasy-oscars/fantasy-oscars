import type express from "express";
import type { Router } from "express";
import { query, type DbClient } from "../../data/db.js";
import { AppError } from "../../errors.js";
import type { AuthedRequest } from "../../auth/middleware.js";

export function registerAdminFilmReadRoutes(args: { router: Router; client: DbClient }) {
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

  router.get(
    "/films/by-tmdb/:tmdbId",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const tmdbId = Number(req.params.tmdbId);
        if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "tmdbId must be a positive integer");
        }
        const { rows } = await query<{ id: number; title: string; tmdb_id: number }>(
          client,
          `SELECT id::int, title, tmdb_id::int
           FROM film
           WHERE tmdb_id = $1::int
           ORDER BY id ASC
           LIMIT 1`,
          [tmdbId]
        );
        const film = rows[0];
        if (!film) throw new AppError("NOT_FOUND", 404, "Film not found");
        return res.status(200).json({ film });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/films/:id/credits",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid film id");
        }
        const { rows } = await query<{ tmdb_credits: unknown | null }>(
          client,
          `SELECT tmdb_credits FROM film WHERE id = $1`,
          [id]
        );
        const credits = rows[0]?.tmdb_credits ?? null;
        // Don't over-validate; this payload is sourced from TMDB and stored as jsonb.
        return res.status(200).json({ credits });
      } catch (err) {
        next(err);
      }
    }
  );
}

