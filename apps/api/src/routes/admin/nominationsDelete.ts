import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, runInTransaction, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { hasDraftsStartedForCeremony } from "../../data/repositories/draftRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminNominationDeleteRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.delete(
    "/nominations/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const nominationId = Number(req.params.id);
        if (!Number.isInteger(nominationId) || nominationId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid nomination id");
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows: rows0 } = await query<{
            id: number;
            category_edition_id: number;
            song_id: number | null;
            performance_id: number | null;
            ceremony_id: number;
          }>(
            tx,
            `SELECT
               n.id::int,
               n.category_edition_id::int,
               n.song_id::int,
               n.performance_id::int,
               ce.ceremony_id::int
             FROM nomination n
             JOIN category_edition ce ON ce.id = n.category_edition_id
             WHERE n.id = $1`,
            [nominationId]
          );
          const row = rows0[0];
          if (!row) throw new AppError("NOT_FOUND", 404, "Nomination not found");

          const { rows: ceremonyRows } = await query<{ status: string }>(
            tx,
            `SELECT status FROM ceremony WHERE id = $1`,
            [row.ceremony_id]
          );
          const status = ceremonyRows[0]?.status;
          if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
          if (status !== "DRAFT") {
            throw new AppError(
              "CEREMONY_NOT_DRAFT",
              409,
              "Nominations can only be deleted while the ceremony is in draft"
            );
          }

          const draftsStarted = await hasDraftsStartedForCeremony(tx, row.ceremony_id);
          if (draftsStarted) {
            throw new AppError(
              "DRAFTS_LOCKED",
              409,
              "Nominee structural changes are locked after drafts start"
            );
          }

          // Remove dependent rows first (no ON DELETE CASCADE on these FKs).
          await query(
            tx,
            `DELETE FROM nomination_contributor WHERE nomination_id = $1`,
            [nominationId]
          );
          await query(
            tx,
            `DELETE FROM nomination_change_audit WHERE nomination_id = $1`,
            [nominationId]
          );
          await query(
            tx,
            `DELETE FROM nomination_change_audit WHERE replacement_nomination_id = $1`,
            [nominationId]
          );

          // Now remove the nomination.
          await query(tx, `DELETE FROM nomination WHERE id = $1`, [nominationId]);

          // Best-effort cleanup of now-unreferenced song/performance rows.
          if (row.song_id) {
            await query(
              tx,
              `DELETE FROM song
               WHERE id = $1
                 AND NOT EXISTS (SELECT 1 FROM nomination WHERE song_id = $1)`,
              [row.song_id]
            );
          }
          if (row.performance_id) {
            await query(
              tx,
              `DELETE FROM performance
               WHERE id = $1
                 AND NOT EXISTS (SELECT 1 FROM nomination WHERE performance_id = $1)`,
              [row.performance_id]
            );
          }

          return {
            ceremony_id: row.ceremony_id,
            category_edition_id: row.category_edition_id
          };
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "delete_nomination",
            target_type: "nomination",
            target_id: nominationId,
            meta: result
          });
        }

        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );
}

