import express from "express";
import { AppError, validationError } from "../errors.js";
import {
  createDraft,
  getDraftById,
  getDraftByLeagueId,
  updateDraftOnStart,
  countDraftSeats
} from "../data/repositories/draftRepository.js";
import { getLeagueById } from "../data/repositories/leagueRepository.js";
import type { DbClient } from "../data/db.js";
import { transitionDraftState } from "../domain/draftState.js";

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

  router.post("/:id/start", async (req, res, next) => {
    try {
      const draftId = Number(req.params.id);
      if (Number.isNaN(draftId)) {
        throw validationError("Invalid draft id", ["id"]);
      }

      const draft = await getDraftById(client, draftId);
      if (!draft) {
        throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");
      }

      if (draft.status !== "PENDING") {
        throw new AppError("DRAFT_ALREADY_STARTED", 409, "Draft already started");
      }

      const seats = await countDraftSeats(client, draftId);
      if (seats <= 0) {
        throw new AppError("PREREQ_MISSING_SEATS", 400, "No draft seats configured");
      }

      const now = new Date();
      const transitioned = transitionDraftState(
        {
          id: draft.id,
          status: draft.status,
          started_at: draft.started_at,
          completed_at: draft.completed_at
        },
        "IN_PROGRESS",
        () => now
      );

      const updated = await updateDraftOnStart(
        client,
        draft.id,
        draft.current_pick_number ?? 1,
        transitioned.started_at ?? now
      );
      if (!updated) throw new AppError("INTERNAL_ERROR", 500, "Failed to start draft");

      return res.status(200).json({ draft: updated });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
