import express from "express";
import type { DbClient } from "../data/db.js";
import { AppError } from "../errors.js";
import { getActiveCeremonyId } from "../data/repositories/appConfigRepository.js";
import { query } from "../data/db.js";
import { getCeremonyDraftLockedAt } from "../data/repositories/ceremonyRepository.js";
import { listWinnersByCeremony } from "../data/repositories/winnerRepository.js";
import { listNominationsForCeremony } from "../data/repositories/nominationRepository.js";
import type { Router } from "express";

export function createCeremonyRouter(client: DbClient): Router {
  const router = express.Router();

  router.get("/active", async (_req, res, next) => {
    try {
      const activeId = await getActiveCeremonyId(client);
      if (!activeId) {
        throw new AppError("ACTIVE_CEREMONY_NOT_SET", 404, "Active ceremony not set");
      }
      const { rows } = await query(
        client,
        `SELECT id::int, code, name, year, starts_at FROM ceremony WHERE id = $1`,
        [activeId]
      );
      const ceremony = rows[0];
      if (!ceremony) {
        throw new AppError("ACTIVE_CEREMONY_INVALID", 500, "Active ceremony is invalid");
      }
      return res.json({ ceremony });
    } catch (err) {
      next(err);
    }
  });

  router.get("/active/lock", async (_req, res, next) => {
    try {
      const activeId = await getActiveCeremonyId(client);
      if (!activeId) {
        return res.json({ draft_locked: false, draft_locked_at: null });
      }
      const lockedAt = await getCeremonyDraftLockedAt(client, activeId);
      return res.json({
        draft_locked: Boolean(lockedAt),
        draft_locked_at: lockedAt ?? null
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/active/winners", async (_req, res, next) => {
    try {
      const activeId = await getActiveCeremonyId(client);
      if (!activeId) {
        return res.json({ winners: [] });
      }
      const winners = await listWinnersByCeremony(client, activeId);
      return res.json({ winners });
    } catch (err) {
      next(err);
    }
  });

  router.get("/active/nominations", async (_req, res, next) => {
    try {
      const activeId = await getActiveCeremonyId(client);
      if (!activeId) {
        return res.json({ nominations: [] });
      }
      const nominations = await listNominationsForCeremony(client, activeId);
      return res.json({ nominations });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
