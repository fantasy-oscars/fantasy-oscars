import type express from "express";
import type { Router } from "express";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, type DbClient } from "../../data/db.js";
import { adminFilmIdParam } from "@fantasy-oscars/shared/schemas";
import { parseParams } from "../../utils/validate.js";

export function registerAdminFilmsCreditsRoute(args: {
  router: Router;
  client: DbClient;
}): void {
  const { router, client } = args;

  router.get(
    "/films/:id/credits",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id } = parseParams(adminFilmIdParam, req.params);
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
