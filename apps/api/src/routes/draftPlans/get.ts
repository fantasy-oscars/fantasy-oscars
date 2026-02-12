import type express from "express";
import type { Pool } from "pg";
import { query, runInTransaction } from "../../data/db.js";
import { AppError, validationError } from "../../errors.js";
import { requireAuth, type AuthedRequest } from "../../auth/middleware.js";
import { listDefaultNominationIdsForCeremony } from "./helpers.js";

export function registerDraftPlanGetRoute(args: {
  router: express.Router;
  pool: Pool;
  authSecret: string;
}) {
  const { router, pool, authSecret } = args;

  // Load a plan + ordering for the current user.
  router.get(
    "/:planId",
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
      try {
        const planId = Number(req.params.planId);
        if (!Number.isInteger(planId) || planId <= 0) {
          throw validationError("Invalid plan id", ["planId"]);
        }
        const userId = Number(req.auth?.sub);
        if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const { rows: planRows } = await query<{
          id: number;
          ceremony_id: number;
          name: string;
        }>(
          pool,
          `SELECT id::int, ceremony_id::int, name FROM draft_plan WHERE id = $1 AND user_id = $2`,
          [planId, userId]
        );
        const plan = planRows[0];
        if (!plan) throw new AppError("NOT_FOUND", 404, "Draft plan not found");

        const result = await runInTransaction(pool, async (tx) => {
          const { rows } = await query<{ nomination_id: number }>(
            tx,
            `
              SELECT nomination_id::int
              FROM draft_plan_item
              WHERE plan_id = $1
              ORDER BY sort_index ASC, id ASC
            `,
            [planId]
          );

          // If a plan was created before nominees existed, it may be empty. In that case,
          // lazily seed it with the default ceremony ordering so it becomes immediately usable.
          if (rows.length === 0) {
            const nominationIds = await listDefaultNominationIdsForCeremony(
              tx,
              plan.ceremony_id
            );
            if (nominationIds.length > 0) {
              const values: string[] = [];
              const params: unknown[] = [planId];
              let idx = 2;
              for (let i = 0; i < nominationIds.length; i += 1) {
                values.push(`($1, $${idx++}, $${idx++})`);
                params.push(nominationIds[i], i);
              }
              await query(
                tx,
                `INSERT INTO draft_plan_item (plan_id, nomination_id, sort_index) VALUES ${values.join(
                  ","
                )}`,
                params
              );
            }
            const { rows: seeded } = await query<{ nomination_id: number }>(
              tx,
              `
                SELECT nomination_id::int
                FROM draft_plan_item
                WHERE plan_id = $1
                ORDER BY sort_index ASC, id ASC
              `,
              [planId]
            );
            return seeded.map((r) => r.nomination_id);
          }

          return rows.map((r) => r.nomination_id);
        });

        return res.status(200).json({ plan, nomination_ids: result });
      } catch (err) {
        next(err);
      }
    }
  );
}
