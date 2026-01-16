import express from "express";
import { AppError } from "../errors.js";
import { type DbClient, query, runInTransaction } from "../data/db.js";
import { AuthedRequest } from "../auth/middleware.js";
import { setActiveCeremonyId } from "../data/repositories/appConfigRepository.js";
import {
  lockCeremonyDraft,
  getCeremonyDraftLockedAt
} from "../data/repositories/ceremonyRepository.js";
import { upsertWinner } from "../data/repositories/winnerRepository.js";
import type { Pool } from "pg";

export function createAdminRouter(client: DbClient) {
  const router = express.Router();

  router.post(
    "/ceremonies/:id/name",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }
        if (!name) {
          throw new AppError("VALIDATION_FAILED", 400, "Name is required");
        }

        const { rows } = await query(
          client,
          `UPDATE ceremony SET name = $1
           WHERE id = $2
           RETURNING id, code, name, year`,
          [name, id]
        );
        const ceremony = rows[0];
        if (!ceremony) {
          throw new AppError("NOT_FOUND", 404, "Ceremony not found");
        }

        return res.status(200).json({ ceremony });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/ceremony/active",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const ceremonyIdRaw = req.body?.ceremony_id;
        const ceremonyId = Number(ceremonyIdRaw);
        if (!ceremonyIdRaw || Number.isNaN(ceremonyId)) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const { rows } = await query(
          client,
          `SELECT id::int, code, name, year FROM ceremony WHERE id = $1`,
          [ceremonyId]
        );
        const ceremony = rows[0];
        if (!ceremony) {
          throw new AppError("NOT_FOUND", 404, "Ceremony not found");
        }

        await setActiveCeremonyId(client, ceremonyId);
        return res.status(200).json({ ceremony });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/winners",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const categoryEditionId = Number(req.body?.category_edition_id);
        const nominationId = Number(req.body?.nomination_id);
        if (!Number.isFinite(categoryEditionId) || categoryEditionId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid category_edition_id");
        }
        if (!Number.isFinite(nominationId) || nominationId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid nomination_id");
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows: catRows } = await query<{
            ceremony_id: number;
          }>(tx, `SELECT ceremony_id::int FROM category_edition WHERE id = $1`, [
            categoryEditionId
          ]);
          const category = catRows[0];
          if (!category) {
            throw new AppError("NOT_FOUND", 404, "Category edition not found");
          }

          const { rows: nomRows } = await query<{ id: number }>(
            tx,
            `SELECT id::int FROM nomination WHERE id = $1 AND category_edition_id = $2`,
            [nominationId, categoryEditionId]
          );
          if (!nomRows[0]) {
            throw new AppError(
              "VALIDATION_FAILED",
              400,
              "Nomination does not belong to category edition"
            );
          }

          const { rows: activeRows } = await query<{ active_ceremony_id: number | null }>(
            tx,
            `SELECT active_ceremony_id FROM app_config WHERE id = TRUE`
          );
          const activeCeremonyId = activeRows[0]?.active_ceremony_id ?? null;
          if (!activeCeremonyId) {
            throw new AppError(
              "ACTIVE_CEREMONY_NOT_SET",
              409,
              "Active ceremony is not configured"
            );
          }
          if (Number(activeCeremonyId) !== Number(category.ceremony_id)) {
            throw new AppError(
              "CEREMONY_INACTIVE",
              409,
              "Only the active ceremony can accept winners"
            );
          }

          const winner = await upsertWinner(tx, {
            ceremony_id: category.ceremony_id,
            category_edition_id: categoryEditionId,
            nomination_id: nominationId
          });

          const lockedAtBefore = await getCeremonyDraftLockedAt(tx, category.ceremony_id);
          const lockedAt =
            lockedAtBefore ??
            (await lockCeremonyDraft(tx, category.ceremony_id)) ??
            lockedAtBefore;

          return { winner, draft_locked_at: lockedAt };
        });

        return res
          .status(200)
          .json({ winner: result.winner, draft_locked_at: result.draft_locked_at });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
