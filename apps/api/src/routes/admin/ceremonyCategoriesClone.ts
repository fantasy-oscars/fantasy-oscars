import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, runInTransaction, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminCeremonyCategoriesCloneRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.post(
    "/ceremonies/:id/categories/clone",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const ceremonyId = Number(req.params.id);
        const fromCeremonyId = Number(req.body?.from_ceremony_id);
        if (!Number.isInteger(ceremonyId) || ceremonyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }
        if (!Number.isInteger(fromCeremonyId) || fromCeremonyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid from_ceremony_id");
        }
        if (ceremonyId === fromCeremonyId) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "Cannot clone from the same ceremony"
          );
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows: ceremonyRows } = await query<{ status: string }>(
            tx,
            `SELECT status FROM ceremony WHERE id = $1`,
            [ceremonyId]
          );
          const status = ceremonyRows[0]?.status;
          if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
          if (status !== "DRAFT") {
            throw new AppError(
              "CEREMONY_NOT_DRAFT",
              409,
              "Categories can only be edited while the ceremony is in draft"
            );
          }

          const { rows: nomCountRows } = await query<{ count: string }>(
            tx,
            `SELECT COUNT(*)::int AS count
             FROM nomination n
             JOIN category_edition ce ON ce.id = n.category_edition_id
             WHERE ce.ceremony_id = $1 AND n.status = 'ACTIVE'`,
            [ceremonyId]
          );
          const nomineeCount = Number(nomCountRows[0]?.count ?? 0);
          if (nomineeCount > 0) {
            throw new AppError(
              "CEREMONY_HAS_NOMINEES",
              409,
              "Cannot clone categories after nominees exist. Remove nominees first."
            );
          }

          // Replace the entire category set.
          await query(tx, `DELETE FROM category_edition WHERE ceremony_id = $1`, [
            ceremonyId
          ]);

          const { rowCount } = await query(
            tx,
            `INSERT INTO category_edition
               (ceremony_id, family_id, code, name, unit_kind, icon_id, icon_variant, sort_index)
             SELECT
               $1,
               ce.family_id,
               ce.code,
               ce.name,
               ce.unit_kind,
               ce.icon_id,
               ce.icon_variant,
               ce.sort_index
             FROM category_edition ce
             WHERE ce.ceremony_id = $2
             ORDER BY ce.sort_index ASC, ce.id ASC`,
            [ceremonyId, fromCeremonyId]
          );

          return { inserted: rowCount ?? 0 };
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "clone_ceremony_categories",
            target_type: "ceremony",
            target_id: ceremonyId,
            meta: { from_ceremony_id: fromCeremonyId, inserted: result.inserted }
          });
        }

        return res.status(200).json({ ok: true, inserted: result.inserted });
      } catch (err) {
        next(err);
      }
    }
  );
}

