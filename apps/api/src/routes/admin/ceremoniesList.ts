import type express from "express";
import type { Router } from "express";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, type DbClient } from "../../data/db.js";

export function registerAdminCeremoniesListRoute(args: { router: Router; client: DbClient }) {
  const { router, client } = args;

  router.get(
    "/ceremonies",
    async (_req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { rows } = await query(
          client,
          `SELECT id::int, code, name, year, starts_at, status
           FROM ceremony
           ORDER BY starts_at DESC NULLS LAST, id DESC`
        );
        return res.status(200).json({ ceremonies: rows });
      } catch (err) {
        next(err);
      }
    }
  );
}

