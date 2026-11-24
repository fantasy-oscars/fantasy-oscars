import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, runInTransaction, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";
import { emitCeremonyFinalized } from "../../realtime/ceremonyEvents.js";
import { syncCircuitCompletionForCeremony } from "../../services/circuit/circuitScoring.js";
import { adminCeremonyIdParam } from "@fantasy-oscars/shared/schemas";
import { parseParams } from "../../utils/validate.js";

export function registerAdminWinnersFinalizeRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.post(
    "/ceremonies/:id/finalize-winners",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id: ceremonyId } = parseParams(adminCeremonyIdParam, req.params);

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows: ceremonyRows } = await query<{
            status: string;
            code: string | null;
            name: string | null;
            results_finalized_at: Date | null;
          }>(
            tx,
            `SELECT status, code, name, results_finalized_at FROM ceremony WHERE id = $1`,
            [ceremonyId]
          );
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
          if (ceremony.results_finalized_at) {
            throw new AppError(
              "CEREMONY_RESULTS_FINALIZED",
              409,
              "Winners are already finalized for this ceremony"
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

          const { rows: updatedRows } = await query<{ results_finalized_at: Date }>(
            tx,
            `UPDATE ceremony SET results_finalized_at = now()
             WHERE id = $1
             RETURNING results_finalized_at`,
            [ceremonyId]
          );
          return {
            id: ceremonyId,
            status: "LOCKED",
            results_finalized_at: updatedRows[0].results_finalized_at,
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
            meta: { results_finalized_at: result.results_finalized_at }
          });
        }

        void emitCeremonyFinalized({
          db: client,
          ceremonyId,
          resultsFinalizedAt: result.results_finalized_at
        });

        // Finalising can finish a full season; the winners were scored as they
        // were entered, so only its status needs settling.
        await syncCircuitCompletionForCeremony(client as Pool, ceremonyId);

        return res.status(200).json({ ceremony: result });
      } catch (err) {
        next(err);
      }
    }
  );
}
