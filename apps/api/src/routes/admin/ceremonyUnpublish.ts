import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, runInTransaction, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { countExtantSeasonsForCeremony } from "../../data/repositories/seasonRepository.js";
import { assertNoSeasonsToWithdraw } from "../../domain/withdrawal.js";
import { AppError } from "../../errors.js";
import { adminCeremonyIdParam } from "@fantasy-oscars/shared/schemas";
import { parseParams } from "../../utils/validate.js";

// Withdraws a published ceremony back to DRAFT, hiding it from players. Refused
// while any season is set up against it; nothing leaves ACTIVE this way.
export function registerAdminCeremonyUnpublishRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.post(
    "/ceremonies/:id/unpublish",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id } = parseParams(adminCeremonyIdParam, req.params);

        const ceremony = await runInTransaction(client as Pool, async (tx) => {
          const { rows: ceremonyRows } = await query<{ status: string }>(
            tx,
            `SELECT status FROM ceremony
             WHERE id = $1 AND deleted_at IS NULL
             FOR UPDATE`,
            [id]
          );
          const status = ceremonyRows[0]?.status;
          if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
          if (status !== "PUBLISHED") {
            throw new AppError(
              "CEREMONY_NOT_PUBLISHED",
              409,
              "Only published ceremonies can be withdrawn",
              { status }
            );
          }
          assertNoSeasonsToWithdraw(
            "CEREMONY_HAS_SEASONS",
            await countExtantSeasonsForCeremony(tx, id)
          );

          const { rows } = await query(
            tx,
            `UPDATE ceremony
             SET status = 'DRAFT', published_at = NULL
             WHERE id = $1
             RETURNING id::int, code, name, year, starts_at, status, published_at`,
            [id]
          );
          return rows[0];
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "unpublish_ceremony",
            target_type: "ceremony",
            target_id: id,
            meta: {}
          });
        }

        return res.status(200).json({ ceremony });
      } catch (err) {
        next(err);
      }
    }
  );
}
