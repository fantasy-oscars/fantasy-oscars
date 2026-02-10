import type express from "express";
import type { Router } from "express";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, type DbClient } from "../../data/db.js";
import { AppError } from "../../errors.js";

export function registerAdminCategoryEditionsDeleteRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.delete(
    "/category-editions/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid category edition id");
        }

        const { rows: ceRows } = await query<{ ceremony_id: number; status: string }>(
          client,
          `SELECT ce.ceremony_id::int AS ceremony_id, c.status
           FROM category_edition ce
           JOIN ceremony c ON c.id = ce.ceremony_id
           WHERE ce.id = $1`,
          [id]
        );
        const ce = ceRows[0];
        if (!ce) throw new AppError("NOT_FOUND", 404, "Category edition not found");
        if (ce.status !== "DRAFT") {
          throw new AppError(
            "CEREMONY_NOT_DRAFT",
            409,
            "Categories can only be edited while the ceremony is in draft"
          );
        }

        const { rows: nomCountRows } = await query<{ count: string }>(
          client,
          `SELECT COUNT(*)::int AS count FROM nomination WHERE category_edition_id = $1 AND status = 'ACTIVE'`,
          [id]
        );
        const nomineeCount = Number(nomCountRows[0]?.count ?? 0);
        if (nomineeCount > 0) {
          throw new AppError(
            "CATEGORY_HAS_NOMINEES",
            409,
            "Cannot remove a category that already has nominees"
          );
        }

        await query(client, `DELETE FROM category_edition WHERE id = $1`, [id]);
        return res.status(204).end();
      } catch (err) {
        next(err);
      }
    }
  );
}

