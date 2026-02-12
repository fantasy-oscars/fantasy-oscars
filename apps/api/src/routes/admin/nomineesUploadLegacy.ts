import express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { hasDraftsStartedForCeremony } from "../../data/repositories/draftRepository.js";
import { AppError } from "../../errors.js";
import { loadNominees } from "../../scripts/load-nominees.js";

export function registerAdminNomineesUploadLegacyRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.post(
    "/nominees/upload",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const dataset = req.body;
        if (!dataset || typeof dataset !== "object") {
          throw new AppError("VALIDATION_FAILED", 400, "Missing JSON body", {
            fields: ["body"]
          });
        }

        const activeCeremonyRows = await query<{ active_ceremony_id: number | null }>(
          client,
          `SELECT active_ceremony_id FROM app_config WHERE id = TRUE`
        );
        const activeCeremonyId = activeCeremonyRows.rows?.[0]?.active_ceremony_id ?? null;
        if (!activeCeremonyId) {
          throw new AppError(
            "ACTIVE_CEREMONY_NOT_SET",
            409,
            "Active ceremony is not configured"
          );
        }
        // Legacy endpoint: delegate to ceremony-scoped upload.
        req.params.id = String(activeCeremonyId);
        // Re-run through the new route logic by duplicating its checks (keep behavior stable).
        const draftsStarted = await hasDraftsStartedForCeremony(
          client,
          Number(activeCeremonyId)
        );
        if (draftsStarted) {
          throw new AppError(
            "DRAFTS_LOCKED",
            409,
            "Nominee structural changes are locked after drafts start"
          );
        }
        await loadNominees(client as unknown as Pool, dataset as never);
        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "nominees_upload",
            target_type: "ceremony",
            target_id: Number(activeCeremonyId)
          });
        }
        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );
}
