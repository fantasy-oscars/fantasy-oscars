import type express from "express";
import type { Pool } from "pg";
import { query } from "../../data/db.js";
import { AppError, validationError } from "../../errors.js";
import { requireAuth, type AuthedRequest } from "../../auth/middleware.js";

export function registerDraftPlanListRoute(args: {
  router: express.Router;
  pool: Pool;
  authSecret: string;
}) {
  const { router, pool, authSecret } = args;

  // List plans for the current user, scoped to a ceremony.
  router.get(
    "/ceremonies/:ceremonyId",
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
      try {
        const ceremonyId = Number(req.params.ceremonyId);
        if (!Number.isInteger(ceremonyId) || ceremonyId <= 0) {
          throw validationError("Invalid ceremony id", ["ceremonyId"]);
        }
        const userId = Number(req.auth?.sub);
        if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const { rows } = await query<{
          id: number;
          name: string;
          updated_at: string;
        }>(
          pool,
          `
            SELECT id::int, name, updated_at
            FROM draft_plan
            WHERE user_id = $1 AND ceremony_id = $2
            ORDER BY updated_at DESC, id DESC
          `,
          [userId, ceremonyId]
        );
        return res.status(200).json({ plans: rows });
      } catch (err) {
        next(err);
      }
    }
  );
}

