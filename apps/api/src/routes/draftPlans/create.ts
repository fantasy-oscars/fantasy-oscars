import type express from "express";
import type { Pool } from "pg";
import { query, runInTransaction } from "../../data/db.js";
import { AppError, validationError } from "../../errors.js";
import { requireAuth, type AuthedRequest } from "../../auth/middleware.js";
import {
  listDefaultNominationIdsForCeremony,
  normalizeDraftPlanName
} from "./helpers.js";

export function registerDraftPlanCreateRoute(args: {
  router: express.Router;
  pool: Pool;
  authSecret: string;
}) {
  const { router, pool, authSecret } = args;

  // Create a plan (and seed it with default nomination order).
  router.post(
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

        const name = String(req.body?.name ?? "").trim();
        if (!name) throw validationError("Plan name is required", ["name"]);
        if (name.length > 80) throw validationError("Plan name is too long", ["name"]);
        const nameNormalized = normalizeDraftPlanName(name);

        const result = await runInTransaction(pool, async (tx) => {
          // Ensure ceremony exists.
          const { rows: ceremonyRows } = await query<{ id: number; status: string }>(
            tx,
            `SELECT id::int, status FROM ceremony WHERE id = $1`,
            [ceremonyId]
          );
          const ceremony = ceremonyRows[0];
          if (!ceremony) {
            throw new AppError("NOT_FOUND", 404, "Ceremony not found");
          }

          // Upsert by normalized name (per-user/per-ceremony).
          const { rows: planRows } = await query<{ id: number; name: string }>(
            tx,
            `
              INSERT INTO draft_plan (user_id, ceremony_id, name, name_normalized)
              VALUES ($1, $2, $3, $4)
              ON CONFLICT (user_id, ceremony_id, name_normalized)
              DO UPDATE SET name = EXCLUDED.name, updated_at = now()
              RETURNING id::int, name
            `,
            [userId, ceremonyId, name, nameNormalized]
          );
          const plan = planRows[0];
          if (!plan) throw new AppError("INTERNAL_ERROR", 500, "Failed to create plan");

          // Seed items only when empty.
          const { rows: itemRows } = await query<{ nomination_id: number }>(
            tx,
            `SELECT nomination_id::int FROM draft_plan_item WHERE plan_id = $1 LIMIT 1`,
            [plan.id]
          );
          if (itemRows.length === 0) {
            const nominationIds = await listDefaultNominationIdsForCeremony(
              tx,
              ceremonyId
            );
            if (nominationIds.length > 0) {
              const values: string[] = [];
              const params: unknown[] = [plan.id];
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
          }

          const { rows: ordered } = await query<{ nomination_id: number }>(
            tx,
            `
              SELECT nomination_id::int
              FROM draft_plan_item
              WHERE plan_id = $1
              ORDER BY sort_index ASC, id ASC
            `,
            [plan.id]
          );

          return { plan, nomination_ids: ordered.map((r) => r.nomination_id) };
        });

        return res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );
}

