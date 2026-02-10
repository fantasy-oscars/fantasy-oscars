import type express from "express";
import type { Router } from "express";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, type DbClient } from "../../data/db.js";
import { AppError } from "../../errors.js";

export function registerAdminFilmsGetByTmdbRoute(args: {
  router: Router;
  client: DbClient;
}): void {
  const { router, client } = args;

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
}

