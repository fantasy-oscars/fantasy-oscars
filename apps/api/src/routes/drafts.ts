import express from "express";
import { AppError, validationError } from "../errors.js";
import {
  createDraft,
  getDraftById,
  getDraftByLeagueId,
  updateDraftOnStart,
  updateDraftCurrentPick,
  countDraftSeats,
  countNominations,
  listDraftSeats,
  listDraftPicks,
  getPickByNomination,
  insertDraftPickRecord
} from "../data/repositories/draftRepository.js";
import { getLeagueById } from "../data/repositories/leagueRepository.js";
import type { DbClient } from "../data/db.js";
import { runInTransaction } from "../data/db.js";
import { transitionDraftState } from "../domain/draftState.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { computePickAssignment } from "../domain/draftOrder.js";
import { getDraftSeatForUser } from "../data/repositories/leagueRepository.js";
import type { Pool } from "pg";

export function buildCreateDraftHandler(client: DbClient) {
  return async function handleCreateDraft(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
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
  };
}

export function buildStartDraftHandler(client: DbClient) {
  return async function handleStartDraft(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
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

      const nominationCount = await countNominations(client);
      if (nominationCount <= 0) {
        throw new AppError(
          "PREREQ_MISSING_NOMINATIONS",
          400,
          "No nominations loaded; load nominees before starting draft"
        );
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
  };
}

export function buildSnapshotDraftHandler(client: DbClient) {
  return async function handleSnapshotDraft(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const draftId = Number(req.params.id);
      if (Number.isNaN(draftId)) {
        throw validationError("Invalid draft id", ["id"]);
      }

      const draft = await getDraftById(client, draftId);
      if (!draft) throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");

      const seats = await listDraftSeats(client, draftId);
      const picks = await listDraftPicks(client, draftId);
      const version = picks.length;

      return res.status(200).json({ draft, seats, picks, version });
    } catch (err) {
      next(err);
    }
  };
}

export function buildSubmitPickHandler(pool: Pool) {
  return async function handleSubmitPick(
    req: AuthedRequest,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const draftId = Number(req.params.id);
      if (Number.isNaN(draftId)) {
        throw validationError("Invalid draft id", ["id"]);
      }

      const draft = await getDraftById(pool, draftId);
      if (!draft) throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");
      if (draft.status !== "IN_PROGRESS") {
        throw new AppError("DRAFT_NOT_IN_PROGRESS", 409, "Draft is not in progress");
      }

      const { nomination_id } = req.body ?? {};
      const userId = Number(req.auth?.sub);
      if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");
      if (!nomination_id) {
        throw validationError("Missing nomination_id", ["nomination_id"]);
      }

      const result = await runInTransaction(pool, async (tx) => {
        const seats = await listDraftSeats(tx, draftId);
        const seatCount = seats.length;
        if (seatCount === 0) {
          throw new AppError("PREREQ_MISSING_SEATS", 400, "No draft seats configured");
        }

        const existingNom = await getPickByNomination(tx, draftId, Number(nomination_id));
        if (existingNom) {
          throw new AppError(
            "NOMINATION_ALREADY_PICKED",
            409,
            "Nomination already picked"
          );
        }

        const currentPick = draft.current_pick_number ?? 1;
        const assignment = computePickAssignment({
          draft_order_type: draft.draft_order_type,
          seat_count: seatCount,
          pick_number: currentPick,
          status: draft.status
        });

        const expectedSeat = seats.find((s) => s.seat_number === assignment.seat_number);
        if (!expectedSeat) {
          throw new AppError("TURN_RESOLUTION_ERROR", 500, "Seat not found for turn");
        }

        const userSeat = await getDraftSeatForUser(tx, draftId, userId);
        if (!userSeat || userSeat.seat_number !== assignment.seat_number) {
          throw new AppError("NOT_ACTIVE_TURN", 409, "It is not your turn");
        }

        const now = new Date();
        const pick = await insertDraftPickRecord(tx, {
          draft_id: draftId,
          pick_number: currentPick,
          round_number: assignment.round_number,
          seat_number: assignment.seat_number,
          league_member_id: expectedSeat.league_member_id,
          nomination_id: Number(nomination_id),
          made_at: now
        });

        const nextPick = currentPick + 1;
        await updateDraftCurrentPick(tx, draftId, nextPick);

        return pick;
      });

      return res.status(201).json({ pick: result });
    } catch (err) {
      next(err);
    }
  };
}

export function createDraftsRouter(client: DbClient, authSecret: string) {
  const router = express.Router();

  router.use(requireAuth(authSecret));
  router.post("/", buildCreateDraftHandler(client));
  router.post("/:id/start", buildStartDraftHandler(client));
  router.get("/:id/snapshot", buildSnapshotDraftHandler(client));
  router.post("/:id/picks", buildSubmitPickHandler(client as unknown as Pool));

  return router;
}
