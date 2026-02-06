import express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import { query, runInTransaction, type DbClient } from "../data/db.js";
import { AppError, validationError } from "../errors.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

async function listDefaultNominationIdsForCeremony(
  db: DbClient,
  ceremonyId: number
): Promise<number[]> {
  const { rows } = await query<{ id: number }>(
    db,
    `
      SELECT n.id::int AS id
      FROM nomination n
      JOIN category_edition ce ON ce.id = n.category_edition_id
      WHERE ce.ceremony_id = $1 AND n.status = 'ACTIVE'
      ORDER BY ce.sort_index ASC, n.sort_order ASC, n.id ASC
    `,
    [ceremonyId]
  );
  return rows.map((r) => r.id);
}

export function createDraftPlansRouter(pool: Pool, authSecret: string): Router {
  const router = express.Router();

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
        const nameNormalized = normalizeName(name);

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
            const nominationIds = await listDefaultNominationIdsForCeremony(tx, ceremonyId);
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
            const nominationIds = await listDefaultNominationIdsForCeremony(tx, plan.ceremony_id);
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

  return router;
}
