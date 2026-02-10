import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, runInTransaction, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";
import { emitCeremonyFinalized } from "../../realtime/ceremonyEvents.js";

export function registerAdminWinnersFinalizeRoute(args: { router: Router; client: DbClient }) {
  const { router, client } = args;

  router.post(
    "/ceremonies/:id/finalize-winners",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const ceremonyId = Number(req.params.id);
        if (!Number.isInteger(ceremonyId) || ceremonyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows: ceremonyRows } = await query<{
            status: string;
            code: string | null;
            name: string | null;
          }>(tx, `SELECT status, code, name FROM ceremony WHERE id = $1`, [ceremonyId]);
          const ceremony = ceremonyRows[0];
          if (!ceremony) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
          if (ceremony.status === "ARCHIVED") {
            throw new AppError(
              "CEREMONY_ARCHIVED",
              409,
              "Archived ceremonies are read-only"
            );
          }
          if (ceremony.status === "DRAFT") {
            throw new AppError(
              "CEREMONY_NOT_PUBLISHED",
              409,
              "Publish the ceremony before finalizing winners"
            );
          }
          if (ceremony.status !== "LOCKED") {
            throw new AppError(
              "CEREMONY_NOT_LOCKED",
              409,
              "Winners can only be finalized once results entry has started (ceremony locked)"
            );
          }

          const { rows: winnerRows } = await query<{ id: number }>(
            tx,
            `SELECT id::int FROM ceremony_winner WHERE ceremony_id = $1 LIMIT 1`,
            [ceremonyId]
          );
          if (!winnerRows[0]) {
            throw new AppError(
              "NO_WINNERS",
              409,
              "At least one winner must be set before finalizing"
            );
          }

          try {
            await query(tx, `UPDATE ceremony SET status = 'COMPLETE' WHERE id = $1`, [
              ceremonyId
            ]);
          } catch (err) {
            const code = (err as { code?: string } | null)?.code;
            if (code === "23514" || code === "42P01") {
              throw new AppError(
                "MIGRATION_REQUIRED",
                409,
                "Database schema is out of date. Apply migrations and restart the API."
              );
            }
            throw err;
          }
          return {
            id: ceremonyId,
            status: "COMPLETE",
            code: ceremony.code,
            name: ceremony.name
          };
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "finalize_winners",
            target_type: "ceremony",
            target_id: ceremonyId,
            meta: { status: "COMPLETE" }
          });
        }

        void emitCeremonyFinalized({ db: client, ceremonyId });

        return res.status(200).json({ ceremony: result });
      } catch (err) {
        next(err);
      }
    }
  );
}

