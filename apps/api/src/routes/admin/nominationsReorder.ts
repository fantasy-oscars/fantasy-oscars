import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, runInTransaction, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { hasDraftsStartedForCeremony } from "../../data/repositories/draftRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminNominationReorderRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.put(
    "/ceremonies/:id/nominations/reorder",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const ceremonyId = Number(req.params.id);
        if (!Number.isInteger(ceremonyId) || ceremonyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const categoryEditionId = Number(req.body?.category_edition_id);
        if (!Number.isInteger(categoryEditionId) || categoryEditionId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "category_edition_id is required");
        }

        const idsRaw = req.body?.nomination_ids;
        const nominationIds = Array.isArray(idsRaw)
          ? idsRaw
              .map((v) =>
                typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
              )
              .filter((n) => Number.isInteger(n) && n > 0)
          : [];

        if (nominationIds.length < 1) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "nomination_ids must include at least one nomination id"
          );
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
              "Nominations can only be edited while the ceremony is in draft"
            );
          }

          const draftsStarted = await hasDraftsStartedForCeremony(tx, ceremonyId);
          if (draftsStarted) {
            throw new AppError(
              "DRAFTS_LOCKED",
              409,
              "Nominee structural changes are locked after drafts start"
            );
          }

          const { rows: catRows } = await query<{ id: number }>(
            tx,
            `SELECT id::int
             FROM category_edition
             WHERE id = $1 AND ceremony_id = $2`,
            [categoryEditionId, ceremonyId]
          );
          if (!catRows[0]?.id) {
            throw new AppError("NOT_FOUND", 404, "Category not found for ceremony");
          }

          const { rows: existingRows } = await query<{ id: number }>(
            tx,
            `SELECT id::int
             FROM nomination
             WHERE category_edition_id = $1
               AND id = ANY($2::bigint[])`,
            [categoryEditionId, nominationIds]
          );
          if (existingRows.length !== nominationIds.length) {
            throw new AppError(
              "VALIDATION_FAILED",
              400,
              "All nomination_ids must belong to the selected category",
              { fields: ["nomination_ids"] }
            );
          }

          for (let i = 0; i < nominationIds.length; i += 1) {
            await query(
              tx,
              `UPDATE nomination
               SET sort_order = $2
               WHERE id = $1 AND category_edition_id = $3`,
              [nominationIds[i], i, categoryEditionId]
            );
          }
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "reorder_nominations",
            target_type: "ceremony",
            target_id: ceremonyId,
            meta: {
              category_edition_id: categoryEditionId,
              nomination_ids: nominationIds
            }
          });
        }

        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );
}

