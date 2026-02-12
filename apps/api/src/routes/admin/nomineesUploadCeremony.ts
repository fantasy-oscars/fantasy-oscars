import express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { hasDraftsStartedForCeremony } from "../../data/repositories/draftRepository.js";
import { AppError } from "../../errors.js";
import { loadNominees } from "../../scripts/load-nominees.js";

export function registerAdminNomineesUploadCeremonyRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.post(
    "/ceremonies/:id/nominees/upload",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const ceremonyId = Number(req.params.id);
        if (!Number.isInteger(ceremonyId) || ceremonyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }
        const dataset = req.body;
        if (!dataset || typeof dataset !== "object") {
          throw new AppError("VALIDATION_FAILED", 400, "Missing JSON body", {
            fields: ["body"]
          });
        }

        const { rows: ceremonyRows } = await query<{ status: string }>(
          client,
          `SELECT status FROM ceremony WHERE id = $1`,
          [ceremonyId]
        );
        const status = ceremonyRows[0]?.status;
        if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
        if (status !== "DRAFT") {
          throw new AppError(
            "CEREMONY_NOT_DRAFT",
            409,
            "Nominees can only be uploaded while the ceremony is in draft"
          );
        }

        const draftsStarted = await hasDraftsStartedForCeremony(client, ceremonyId);
        if (draftsStarted) {
          throw new AppError(
            "DRAFTS_LOCKED",
            409,
            "Nominee structural changes are locked after drafts start"
          );
        }

        // Basic shape validation: ensure ceremonies array has only this ceremony id.
        const ceremonies = (dataset as { ceremonies?: unknown[] }).ceremonies;
        if (!Array.isArray(ceremonies) || ceremonies.length === 0) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "Dataset must include ceremonies",
            {
              fields: ["ceremonies"]
            }
          );
        }
        const ceremonyIds = ceremonies
          .map((c) => (c as { id?: number })?.id)
          .filter((v) => Number.isFinite(v))
          .map((v) => Number(v));
        if (ceremonyIds.length !== 1 || ceremonyIds[0] !== ceremonyId) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "Dataset ceremonies must include only the selected ceremony",
            { fields: ["ceremonies"] }
          );
        }

        await loadNominees(client as unknown as Pool, dataset as never);

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "nominees_upload",
            target_type: "ceremony",
            target_id: ceremonyId
          });
        }

        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );
}
