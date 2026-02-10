import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminCeremonyPublishRoute(args: { router: Router; client: DbClient }) {
  const { router, client } = args;

  router.post(
    "/ceremonies/:id/publish",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const { rows: ceremonyRows } = await query<{
          status: string;
          code: string | null;
          name: string | null;
        }>(client, `SELECT status, code, name FROM ceremony WHERE id = $1`, [id]);
        const row = ceremonyRows[0];
        const status = row?.status;
        if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
        if (status !== "DRAFT") {
          throw new AppError(
            "CEREMONY_NOT_DRAFT",
            409,
            "Only draft ceremonies can be published"
          );
        }
        if (!row?.code || !row.code.trim() || !row?.name || !row.name.trim()) {
          throw new AppError(
            "CEREMONY_INCOMPLETE",
            409,
            "Code and name are required to publish"
          );
        }

        const { rows: statsRows } = await query<{
          categories_total: number;
          categories_with_nominees: number;
        }>(
          client,
          `WITH cats AS (
             SELECT ce.id
             FROM category_edition ce
             WHERE ce.ceremony_id = $1
           ),
           nom AS (
             SELECT DISTINCT n.category_edition_id
             FROM nomination n
             JOIN cats ON cats.id = n.category_edition_id
             WHERE n.status = 'ACTIVE'
           )
           SELECT
             (SELECT COUNT(*)::int FROM cats) AS categories_total,
             (SELECT COUNT(*)::int FROM nom) AS categories_with_nominees`,
          [id]
        );
        const stats = statsRows[0] ?? {
          categories_total: 0,
          categories_with_nominees: 0
        };
        if (stats.categories_total === 0) {
          throw new AppError(
            "CEREMONY_INCOMPLETE",
            409,
            "No categories exist for this ceremony"
          );
        }
        if (stats.categories_with_nominees !== stats.categories_total) {
          throw new AppError(
            "CEREMONY_INCOMPLETE",
            409,
            "All categories must have nominees before publishing"
          );
        }

        const { rows } = await query(
          client,
          `UPDATE ceremony
           SET status = 'PUBLISHED',
               published_at = COALESCE(published_at, now())
           WHERE id = $1
           RETURNING id::int, code, name, year, starts_at, status, published_at`,
          [id]
        );
        const ceremony = rows[0];

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "publish_ceremony",
            target_type: "ceremony",
            target_id: id,
            meta: {}
          });
        }

        return res.status(200).json({ ceremony });
      } catch (err) {
        next(err);
      }
    }
  );
}

