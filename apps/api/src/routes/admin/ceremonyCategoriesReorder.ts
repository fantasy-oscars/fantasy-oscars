import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, runInTransaction, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { hasDraftsStartedForCeremony } from "../../data/repositories/draftRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminCeremonyCategoriesReorderRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.put(
    "/ceremonies/:id/categories/reorder",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const ceremonyId = Number(req.params.id);
        if (!Number.isInteger(ceremonyId) || ceremonyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const idsRaw = req.body?.category_ids;
        const categoryIds = Array.isArray(idsRaw)
          ? idsRaw
              .map((v) =>
                typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
              )
              .filter((n) => Number.isInteger(n) && n > 0)
          : [];

        if (categoryIds.length < 1) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "category_ids must include at least one category id"
          );
        }

        // Deduplicate while preserving order.
        const seen = new Set<number>();
        const uniqueIds: number[] = [];
        for (const id of categoryIds) {
          if (seen.has(id)) continue;
          seen.add(id);
          uniqueIds.push(id);
        }

        await runInTransaction(client as Pool, async (tx) => {
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

          const draftsStarted = await hasDraftsStartedForCeremony(tx, ceremonyId);
          if (draftsStarted) {
            throw new AppError(
              "DRAFTS_LOCKED",
              409,
              "Category structural changes are locked after drafts start"
            );
          }

          const { rows: existingRows } = await query<{ id: number }>(
            tx,
            `SELECT id::int
             FROM category_edition
             WHERE ceremony_id = $1 AND id = ANY($2::bigint[])`,
            [ceremonyId, uniqueIds]
          );
          if (existingRows.length !== uniqueIds.length) {
            throw new AppError(
              "VALIDATION_FAILED",
              400,
              "All category_ids must belong to the ceremony",
              { fields: ["category_ids"] }
            );
          }

          for (let i = 0; i < uniqueIds.length; i += 1) {
            await query(
              tx,
              `UPDATE category_edition
               SET sort_index = $2
               WHERE id = $1 AND ceremony_id = $3`,
              [uniqueIds[i], i + 1, ceremonyId]
            );
          }
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "reorder_categories",
            target_type: "ceremony",
            target_id: ceremonyId,
            meta: { category_ids: uniqueIds }
          });
        }

        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );
}
