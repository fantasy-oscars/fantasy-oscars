import type express from "express";
import type { Router } from "express";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, type DbClient } from "../../data/db.js";
import { AppError } from "../../errors.js";

export function registerAdminCeremonyCategoriesListRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.get(
    "/ceremonies/:id/categories",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const ceremonyId = Number(req.params.id);
        if (!Number.isInteger(ceremonyId) || ceremonyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const { rows: ceremonyRows } = await query<{
          id: number;
          status: string;
          code: string | null;
          name: string | null;
        }>(client, `SELECT id::int, status, code, name FROM ceremony WHERE id = $1`, [
          ceremonyId
        ]);
        const ceremony = ceremonyRows[0];
        if (!ceremony) throw new AppError("NOT_FOUND", 404, "Ceremony not found");

        const { rows } = await query(
          client,
          `SELECT
             ce.id::int,
             ce.family_id::int,
             ce.code AS family_code,
             ce.name AS family_name,
             ce.unit_kind,
             ce.icon_id::int,
             ce.icon_variant,
             ce.sort_index::int,
             i.code AS icon_code,
             ce.unit_kind AS family_default_unit_kind,
             ce.icon_id::int AS family_icon_id,
             ce.icon_variant AS family_icon_variant,
             i.code AS family_icon_code
           FROM category_edition ce
           LEFT JOIN icon i ON i.id = ce.icon_id
           WHERE ce.ceremony_id = $1
           ORDER BY ce.sort_index ASC, ce.id ASC`,
          [ceremonyId]
        );

        return res.status(200).json({ ceremony, categories: rows });
      } catch (err) {
        next(err);
      }
    }
  );
}

