import type express from "express";
import type { Router } from "express";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, type DbClient } from "../../data/db.js";
import { AppError } from "../../errors.js";
import { adminCeremonyIdParam } from "@fantasy-oscars/shared/schemas";
import { parseParams } from "../../utils/validate.js";

export function registerAdminCeremonyDraftLockStatusRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.get(
    "/ceremonies/:id/lock",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id: ceremonyId } = parseParams(adminCeremonyIdParam, req.params);
        const { rows } = await query<{ status: string; draft_locked_at: Date | null }>(
          client,
          `SELECT status, draft_locked_at FROM ceremony WHERE id = $1`,
          [ceremonyId]
        );
        const row = rows[0];
        if (!row) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
        return res.status(200).json({
          status: row.status,
          draft_locked: Boolean(row.draft_locked_at) || row.status === "LOCKED",
          draft_locked_at: row.draft_locked_at ?? null
        });
      } catch (err) {
        next(err);
      }
    }
  );
}
