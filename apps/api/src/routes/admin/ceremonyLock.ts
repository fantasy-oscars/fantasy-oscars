import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, runInTransaction, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { cancelDraftsForCeremony } from "../../data/repositories/draftRepository.js";
import {
  getCeremonyDraftLockedAt,
  lockCeremonyDraft
} from "../../data/repositories/ceremonyRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminCeremonyLockRoute(args: { router: Router; client: DbClient }) {
  const { router, client } = args;

  router.post(
    "/ceremonies/:id/lock",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows: ceremonyRows } = await query<{ status: string }>(
            tx,
            `SELECT status FROM ceremony WHERE id = $1`,
            [id]
          );
          const status = ceremonyRows[0]?.status;
          if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
          if (status === "ARCHIVED") {
            throw new AppError(
              "CEREMONY_ARCHIVED",
              409,
              "Archived ceremonies cannot be locked"
            );
          }
          if (status !== "PUBLISHED" && status !== "LOCKED") {
            throw new AppError(
              "CEREMONY_NOT_PUBLISHED",
              409,
              "Only published ceremonies can be locked"
            );
          }

          const lockedAtBefore = await getCeremonyDraftLockedAt(tx, id);
          const lockedAt =
            lockedAtBefore ?? (await lockCeremonyDraft(tx, id)) ?? lockedAtBefore;

          const { rows: updatedRows } = await query(
            tx,
            `UPDATE ceremony
             SET status = 'LOCKED'
             WHERE id = $1
             RETURNING id::int, status`,
            [id]
          );
          void updatedRows;

          const cancelled = await cancelDraftsForCeremony(tx, id);

          return { draft_locked_at: lockedAt, cancelled_count: cancelled.length };
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "lock_ceremony",
            target_type: "ceremony",
            target_id: id,
            meta: { cancelled_drafts: result.cancelled_count }
          });
        }

        return res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );
}
