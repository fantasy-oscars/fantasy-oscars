import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminCeremonyArchiveRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.post(
    "/ceremonies/:id/archive",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const { rows: ceremonyRows } = await query<{ status: string }>(
          client,
          `SELECT status FROM ceremony WHERE id = $1`,
          [id]
        );
        const status = ceremonyRows[0]?.status;
        if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
        if (status !== "COMPLETE") {
          throw new AppError(
            "CEREMONY_NOT_COMPLETE",
            409,
            "Ceremony results must be finalized before archiving"
          );
        }

        const { rows } = await query(
          client,
          `UPDATE ceremony
           SET status = 'ARCHIVED',
               archived_at = COALESCE(archived_at, now())
           WHERE id = $1
           RETURNING id::int, status, archived_at`,
          [id]
        );

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "archive_ceremony",
            target_type: "ceremony",
            target_id: id,
            meta: {}
          });
        }

        return res.status(200).json({ ceremony: rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );
}
