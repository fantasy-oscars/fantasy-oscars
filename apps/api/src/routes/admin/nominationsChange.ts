import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, runInTransaction, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import {
  insertNominationChangeAudit,
  updateNominationStatus
} from "../../data/repositories/nominationRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminNominationChangeRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.post(
    "/nominations/:id/change",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const nominationId = Number(req.params.id);
        if (!Number.isFinite(nominationId) || nominationId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid nomination id");
        }
        const {
          action,
          origin,
          impact,
          reason,
          replacement_nomination_id
        }: {
          action?: "REVOKE" | "REPLACE" | "RESTORE";
          origin?: "INTERNAL" | "EXTERNAL";
          impact?: "CONSEQUENTIAL" | "BENIGN";
          reason?: string;
          replacement_nomination_id?: number | null;
        } = req.body ?? {};

        if (!action || !["REVOKE", "REPLACE", "RESTORE"].includes(action)) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid action");
        }
        if (!origin || !["INTERNAL", "EXTERNAL"].includes(origin)) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid origin");
        }
        if (!impact || !["CONSEQUENTIAL", "BENIGN"].includes(impact)) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid impact");
        }
        if (!reason || typeof reason !== "string" || reason.trim().length < 5) {
          throw new AppError("VALIDATION_FAILED", 400, "Reason required (min 5 chars)");
        }

        await runInTransaction(client as Pool, async (tx) => {
          const { rows: nomRows } = await query<{ id: number }>(
            tx,
            `SELECT id FROM nomination WHERE id = $1`,
            [nominationId]
          );
          if (nomRows.length === 0) {
            throw new AppError("NOT_FOUND", 404, "Nomination not found");
          }

          if (action === "REPLACE") {
            if (!replacement_nomination_id || Number.isNaN(replacement_nomination_id)) {
              throw new AppError(
                "VALIDATION_FAILED",
                400,
                "replacement_nomination_id required"
              );
            }
            const { rows: replRows } = await query<{ id: number }>(
              tx,
              `SELECT id FROM nomination WHERE id = $1`,
              [replacement_nomination_id]
            );
            if (replRows.length === 0) {
              throw new AppError("NOT_FOUND", 404, "Replacement nomination not found");
            }
          }

          const status: "ACTIVE" | "REVOKED" | "REPLACED" =
            action === "RESTORE"
              ? "ACTIVE"
              : action === "REVOKE"
                ? "REVOKED"
                : "REPLACED";
          await updateNominationStatus(tx, {
            nomination_id: nominationId,
            status,
            replaced_by_nomination_id:
              action === "REPLACE" ? (replacement_nomination_id ?? null) : null
          });

          await insertNominationChangeAudit(tx, {
            nomination_id: nominationId,
            replacement_nomination_id:
              action === "REPLACE" ? (replacement_nomination_id ?? null) : null,
            origin,
            impact,
            action,
            reason,
            created_by_user_id: Number(req.auth?.sub)
          });
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "nomination_change",
            target_type: "nomination",
            target_id: nominationId,
            meta: { action, origin, impact, reason, replacement_nomination_id }
          });
        }

        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );
}
