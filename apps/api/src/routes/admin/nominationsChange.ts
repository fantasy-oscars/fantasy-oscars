import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, runInTransaction, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { rebuildCircuitScoresAfterWrite } from "../../services/circuit/circuitScoring.js";
import {
  insertNominationChangeAudit,
  updateNominationStatus
} from "../../data/repositories/nominationRepository.js";
import { AppError } from "../../errors.js";
import {
  adminNominationChangeBody,
  adminNominationIdParam
} from "@fantasy-oscars/shared/schemas";
import { parseBody, parseParams } from "../../utils/validate.js";

export function registerAdminNominationChangeRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.post(
    "/nominations/:id/change",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id: nominationId } = parseParams(adminNominationIdParam, req.params);
        const { action, origin, impact, reason, replacement_nomination_id } = parseBody(
          adminNominationChangeBody,
          req.body
        );
        const ceremonyId = await runInTransaction(client as Pool, async (tx) => {
          const { rows: nomRows } = await query<{ ceremony_id: number }>(
            tx,
            `SELECT ce.ceremony_id::int AS ceremony_id
             FROM nomination n
             JOIN category_edition ce ON ce.id = n.category_edition_id
             WHERE n.id = $1`,
            [nominationId]
          );
          if (nomRows.length === 0) {
            throw new AppError("NOT_FOUND", 404, "Nomination not found");
          }

          if (action === "REPLACE") {
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
          return nomRows[0]!.ceremony_id;
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

        await rebuildCircuitScoresAfterWrite(
          client as Pool,
          { ceremonyId },
          "nomination_change"
        );

        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );
}
