import express from "express";
import { AppError, validationError } from "../errors.js";
import { createDraft, getDraftByLeagueId } from "../data/repositories/draftRepository.js";
import { getLeagueById } from "../data/repositories/leagueRepository.js";
import type { DbClient } from "../data/db.js";

export function createDraftsRouter(client: DbClient) {
  const router = express.Router();

  router.post("/", async (req, res, next) => {
    try {
      const { league_id, draft_order_type } = req.body ?? {};

      const leagueIdNum = Number(league_id);
      if (!league_id || Number.isNaN(leagueIdNum)) {
        throw validationError("Missing or invalid league_id", ["league_id"]);
      }

      const order = (draft_order_type ?? "SNAKE").toUpperCase();
      if (order !== "SNAKE" && order !== "LINEAR") {
        throw validationError("Invalid draft_order_type", ["draft_order_type"]);
      }

      const league = await getLeagueById(client, leagueIdNum);
      if (!league) {
        throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
      }

      const existing = await getDraftByLeagueId(client, leagueIdNum);
      if (existing) {
        throw new AppError("DRAFT_EXISTS", 409, "Draft already exists for this league");
      }

      const draft = await createDraft(client, {
        league_id: leagueIdNum,
        status: "PENDING",
        draft_order_type: order,
        current_pick_number: null,
        started_at: null,
        completed_at: null
      });

      return res.status(201).json({ draft });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
