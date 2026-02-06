import express from "express";
import type { Router } from "express";
import type { DbClient } from "../data/db.js";
import { query } from "../data/db.js";
import { AppError } from "../errors.js";
import { getDraftBoardForCeremony } from "../domain/draftBoard.js";
import { listWinnersByCeremony } from "../data/repositories/winnerRepository.js";

export function createCeremoniesRouter(client: DbClient): Router {
  const router = express.Router();

  // User-visible ceremony index: active (published/locked) and archived.
  router.get("/", async (_req, res, next) => {
    try {
      const { rows } = await query(
        client,
        `SELECT id::int, code, name, year, starts_at, status
         FROM ceremony
         WHERE status IN ('PUBLISHED','LOCKED','COMPLETE','ARCHIVED')
         ORDER BY starts_at DESC NULLS LAST, id DESC`
      );
      return res.status(200).json({ ceremonies: rows });
    } catch (err) {
      next(err);
    }
  });

  // "Active" to users: published or locked. (Locked stays visible, but blocks new seasons/drafts.)
  router.get("/active", async (_req, res, next) => {
    try {
      const { rows } = await query(
        client,
        `SELECT id::int, code, name, year, starts_at, status
         FROM ceremony
         WHERE status IN ('PUBLISHED','LOCKED','COMPLETE')
         ORDER BY year DESC, id DESC`
      );
      return res.status(200).json({ ceremonies: rows });
    } catch (err) {
      next(err);
    }
  });

  // Ceremonies that commissioners can create seasons for.
  router.get("/published", async (_req, res, next) => {
    try {
      const { rows } = await query(
        client,
        `SELECT id::int, code, name, year, starts_at, status
         FROM ceremony
         WHERE status = 'PUBLISHED'
         ORDER BY year DESC, id DESC`
      );
      return res.status(200).json({ ceremonies: rows });
    } catch (err) {
      next(err);
    }
  });

  // User-visible ceremony detail (nominees + winners).
  router.get("/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
      }

      const { rows } = await query<{
        id: number;
        code: string | null;
        name: string | null;
        year: number | null;
        starts_at: string | null;
        status: string;
      }>(
        client,
        `SELECT id::int, code, name, year, starts_at, status
         FROM ceremony
         WHERE id = $1`,
        [id]
      );
      const ceremony = rows[0];
      // Draft ceremonies are admin-only.
      if (!ceremony || ceremony.status === "DRAFT") {
        throw new AppError("NOT_FOUND", 404, "Ceremony not found");
      }

      const board = await getDraftBoardForCeremony(client, id);
      const winners = await listWinnersByCeremony(client, id);
      return res.status(200).json({ ceremony, ...board, winners });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
