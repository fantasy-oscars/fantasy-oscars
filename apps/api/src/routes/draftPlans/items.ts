import type express from "express";
import type { Pool } from "pg";
import { query, runInTransaction } from "../../data/db.js";
import { AppError, validationError } from "../../errors.js";
import { requireAuth, type AuthedRequest } from "../../auth/middleware.js";

export function registerDraftPlanItemsRoutes(args: {
  router: express.Router;
  pool: Pool;
  authSecret: string;
}) {
  const { router, pool, authSecret } = args;

  // Replace plan ordering (real-time persistence).
  router.put(
    "/:planId/items",
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
      try {
        const planId = Number(req.params.planId);
        if (!Number.isInteger(planId) || planId <= 0) {
          throw validationError("Invalid plan id", ["planId"]);
        }
        const userId = Number(req.auth?.sub);
        if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const ids = req.body?.nomination_ids;
        if (!Array.isArray(ids)) {
          throw validationError("nomination_ids must be an array", ["nomination_ids"]);
        }
        const nominationIds = ids
          .map((v: unknown) => Number(v))
          .filter((n: number) => Number.isInteger(n) && n > 0);
        if (nominationIds.length !== ids.length) {
          throw validationError("Invalid nomination_ids", ["nomination_ids"]);
        }
        const uniq = new Set(nominationIds);
        if (uniq.size !== nominationIds.length) {
          throw validationError("Duplicate nomination_ids", ["nomination_ids"]);
        }

        await runInTransaction(pool, async (tx) => {
          const { rows: planRows } = await query<{
            id: number;
            ceremony_id: number;
          }>(
            tx,
            `SELECT id::int, ceremony_id::int FROM draft_plan WHERE id = $1 AND user_id = $2`,
            [planId, userId]
          );
          const plan = planRows[0];
          if (!plan) throw new AppError("NOT_FOUND", 404, "Draft plan not found");

          // Ensure every nomination belongs to the ceremony.
          const { rows: nomRows } = await query<{ id: number }>(
            tx,
            `
              SELECT n.id::int
              FROM nomination n
              JOIN category_edition ce ON ce.id = n.category_edition_id
              WHERE ce.ceremony_id = $1 AND n.id = ANY($2::bigint[])
            `,
            [plan.ceremony_id, nominationIds]
          );
          if (nomRows.length !== nominationIds.length) {
            throw validationError("Some nominees are not part of this ceremony", [
              "nomination_ids"
            ]);
          }

          await query(tx, `DELETE FROM draft_plan_item WHERE plan_id = $1`, [planId]);

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

          await query(tx, `UPDATE draft_plan SET updated_at = now() WHERE id = $1`, [
            planId
          ]);
        });

        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );
}
