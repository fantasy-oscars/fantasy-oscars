import type express from "express";
import type { Router } from "express";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, type DbClient } from "../../data/db.js";
import { AppError } from "../../errors.js";

export function registerAdminCeremonyGetRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.get(
    "/ceremonies/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const { rows } = await query(
          client,
          `SELECT
             id::int,
             code,
             name,
             year,
             starts_at,
             status,
             draft_warning_hours::int,
             draft_locked_at,
             published_at,
             archived_at
           FROM ceremony
           WHERE id = $1
             AND deleted_at IS NULL`,
          [id]
        );
        const ceremony = rows[0];
        if (!ceremony) throw new AppError("NOT_FOUND", 404, "Ceremony not found");

        const { rows: statsRows } = await query<{
          categories_total: number;
          categories_with_nominees: number;
          nominees_total: number;
          winners_total: number;
        }>(
          client,
          `WITH cats AS (
             SELECT ce.id
             FROM category_edition ce
             WHERE ce.ceremony_id = $1
           ),
           nom AS (
             SELECT n.category_edition_id
             FROM nomination n
             JOIN cats ON cats.id = n.category_edition_id
             WHERE n.status = 'ACTIVE'
           )
           SELECT
             (SELECT COUNT(*)::int FROM cats) AS categories_total,
             (SELECT COUNT(DISTINCT category_edition_id)::int FROM nom) AS categories_with_nominees,
             (SELECT COUNT(*)::int FROM nom) AS nominees_total,
             (SELECT COUNT(*)::int FROM ceremony_winner WHERE ceremony_id = $1) AS winners_total`,
          [id]
        );
        const stats = statsRows[0] ?? {
          categories_total: 0,
          categories_with_nominees: 0,
          nominees_total: 0,
          winners_total: 0
        };

        return res.status(200).json({ ceremony, stats });
      } catch (err) {
        next(err);
      }
    }
  );
}
