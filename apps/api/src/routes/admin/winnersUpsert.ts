import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, runInTransaction, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import {
  getCeremonyDraftLockedAt,
  lockCeremonyDraft
} from "../../data/repositories/ceremonyRepository.js";
import { cancelDraftsForCeremony } from "../../data/repositories/draftRepository.js";
import { setWinnersForCategoryEdition } from "../../data/repositories/winnerRepository.js";
import { AppError } from "../../errors.js";
import { emitCeremonyWinnersUpdated } from "../../realtime/ceremonyEvents.js";

export function registerAdminWinnersUpsertRoute(args: { router: Router; client: DbClient }) {
  const { router, client } = args;

  router.post(
    "/winners",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const categoryEditionId = Number(req.body?.category_edition_id);
        const nominationIdsRaw = req.body?.nomination_ids;
        const nominationId = Number(req.body?.nomination_id);
        if (!Number.isFinite(categoryEditionId) || categoryEditionId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid category_edition_id");
        }
        const nominationIds = Array.isArray(nominationIdsRaw)
          ? (nominationIdsRaw as unknown[])
              .map((v) =>
                typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
              )
              .filter((n) => Number.isFinite(n) && n > 0)
          : Number.isFinite(nominationId) && nominationId > 0
            ? [nominationId]
            : [];
        if (nominationIds.length === 0) {
          throw new AppError("VALIDATION_FAILED", 400, "nomination_ids is required");
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows: catRows } = await query<{
            ceremony_id: number;
          }>(tx, `SELECT ceremony_id::int FROM category_edition WHERE id = $1`, [
            categoryEditionId
          ]);
          const category = catRows[0];
          if (!category) {
            throw new AppError("NOT_FOUND", 404, "Category edition not found");
          }

          for (const nid of nominationIds) {
            const { rows: nomRows } = await query<{ id: number }>(
              tx,
              `SELECT id::int FROM nomination WHERE id = $1 AND category_edition_id = $2`,
              [nid, categoryEditionId]
            );
            if (!nomRows[0]) {
              throw new AppError(
                "VALIDATION_FAILED",
                400,
                "Nomination does not belong to category edition"
              );
            }
          }

          const { rows: ceremonyRows } = await query<{
            status: string;
            draft_locked_at: Date | null;
          }>(tx, `SELECT status, draft_locked_at FROM ceremony WHERE id = $1`, [
            category.ceremony_id
          ]);
          const ceremony = ceremonyRows[0];
          if (!ceremony) {
            throw new AppError("NOT_FOUND", 404, "Ceremony not found");
          }
          if (ceremony.status === "DRAFT") {
            throw new AppError(
              "CEREMONY_NOT_PUBLISHED",
              409,
              "Ceremony must be published before entering winners"
            );
          }
          if (ceremony.status === "ARCHIVED") {
            throw new AppError(
              "CEREMONY_ARCHIVED",
              409,
              "Archived ceremonies are read-only"
            );
          }
          if (ceremony.status === "COMPLETE") {
            throw new AppError(
              "CEREMONY_COMPLETE",
              409,
              "This ceremony has finalized winners and is read-only for results entry"
            );
          }

          const winners = await setWinnersForCategoryEdition(tx, {
            ceremony_id: category.ceremony_id,
            category_edition_id: categoryEditionId,
            nomination_ids: nominationIds
          });

          // First winner locks drafting for this ceremony, aborting any in-progress drafts.
          const shouldLock = ceremony.status !== "LOCKED";
          const lockedAtBefore =
            ceremony.draft_locked_at ??
            (await getCeremonyDraftLockedAt(tx, category.ceremony_id));
          const lockedAt =
            lockedAtBefore ??
            (await lockCeremonyDraft(tx, category.ceremony_id)) ??
            lockedAtBefore;
          let cancelledCount = 0;
          if (shouldLock) {
            await query(tx, `UPDATE ceremony SET status = 'LOCKED' WHERE id = $1`, [
              category.ceremony_id
            ]);
            const cancelled = await cancelDraftsForCeremony(tx, category.ceremony_id);
            cancelledCount = cancelled.length;
          }

          return {
            ceremony_id: category.ceremony_id,
            winners,
            draft_locked_at: lockedAt,
            cancelled_drafts: cancelledCount
          };
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "winner_upsert",
            target_type: "category_edition",
            target_id: Number(categoryEditionId),
            meta: {
              ceremony_id: result.ceremony_id,
              nomination_ids: nominationIds,
              cancelled_drafts: result.cancelled_drafts
            }
          });
        }

        // Notify any connected draft rooms (results view) that winners changed.
        void emitCeremonyWinnersUpdated({
          db: client,
          ceremonyId: result.ceremony_id,
          categoryEditionId,
          nominationIds
        });

        return res.status(200).json({
          winners: result.winners,
          draft_locked_at: result.draft_locked_at,
          cancelled_drafts: result.cancelled_drafts
        });
      } catch (err) {
        next(err);
      }
    }
  );
}

