import express from "express";
import type { Pool } from "pg";
import { AppError, validationError } from "../../errors.js";
import { runInTransaction } from "../../data/db.js";
import {
  createDraftEvent,
  getDraftByIdForUpdate,
  updateDraftStatus,
  updateDraftTimer
} from "../../data/repositories/draftRepository.js";
import {
  getLeagueById,
  getLeagueMember
} from "../../data/repositories/leagueRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { mapDraftStateError, transitionDraftState } from "../../domain/draftState.js";
import { computeDeadline } from "../../domain/draftPickRules.js";
import { emitDraftEvent } from "../../realtime/draftEvents.js";
import type { AuthedRequest } from "../../auth/middleware.js";

function requireCommissionerOrOwner(
  userId: number,
  league: { created_by_user_id: number },
  leagueMember: { role: string } | null
) {
  return (
    league.created_by_user_id === userId ||
    (leagueMember && (leagueMember.role === "OWNER" || leagueMember.role === "CO_OWNER"))
  );
}

export function buildPauseDraftHandler(pool: Pool) {
  return async function handlePauseDraft(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const draftId = Number(req.params.id);
      if (Number.isNaN(draftId)) throw validationError("Invalid draft id", ["id"]);
      const userId = Number((req as AuthedRequest).auth?.sub);

      const result = await runInTransaction(pool, async (tx) => {
        const draft = await getDraftByIdForUpdate(tx, draftId);
        if (!draft) throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");
        const season = await getSeasonById(tx, draft.season_id);
        if (!season || season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }
        const league = await getLeagueById(tx, season.league_id);
        if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
        // Multi-ceremony: drafting is scoped to the ceremony attached to this season.
        const leagueMember = await getLeagueMember(tx, league.id, userId);
        const isCommissioner = requireCommissionerOrOwner(userId, league, leagueMember);
        if (!isCommissioner) {
          throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
        }
        if (draft.status === "PAUSED") {
          throw new AppError("DRAFT_ALREADY_PAUSED", 409, "Draft already paused");
        }
        if (draft.status !== "IN_PROGRESS") {
          throw new AppError("DRAFT_NOT_IN_PROGRESS", 409, "Draft is not in progress");
        }

        let transitioned;
        try {
          transitioned = transitionDraftState(
            {
              id: draft.id,
              status: draft.status,
              started_at: draft.started_at,
              completed_at: draft.completed_at
            },
            "PAUSED"
          );
        } catch (err) {
          const mapped = mapDraftStateError(err);
          if (mapped) {
            throw new AppError("INVALID_STATE", 400, mapped.message);
          }
          throw err;
        }

        let updatedTimer = null;
        if (draft.pick_timer_seconds) {
          const deadline = draft.pick_deadline_at
            ? new Date(draft.pick_deadline_at)
            : null;
          const remainingMs =
            deadline && deadline.getTime() > Date.now()
              ? deadline.getTime() - Date.now()
              : 0;
          updatedTimer = await updateDraftTimer(tx, draft.id, null, remainingMs);
        }

        const updated = await updateDraftStatus(tx, draft.id, transitioned.status);
        if (!updated) throw new AppError("INTERNAL_ERROR", 500, "Failed to pause draft");
        const updatedDraft = {
          ...updated,
          pick_deadline_at: updatedTimer?.pick_deadline_at ?? draft.pick_deadline_at,
          pick_timer_remaining_ms:
            updatedTimer?.pick_timer_remaining_ms ?? draft.pick_timer_remaining_ms
        };

        const event = await createDraftEvent(tx, {
          draft_id: draft.id,
          event_type: "draft.paused",
          payload: {
            draft: {
              id: updatedDraft.id,
              status: updatedDraft.status,
              current_pick_number: updatedDraft.current_pick_number,
              started_at: updatedDraft.started_at,
              completed_at: updatedDraft.completed_at,
              pick_deadline_at: updatedDraft.pick_deadline_at
            }
          }
        });

        return { draft: { ...updatedDraft, version: event.version }, event };
      });

      emitDraftEvent(result.event);
      return res.status(200).json({ draft: result.draft });
    } catch (err) {
      next(err);
    }
  };
}

export function buildResumeDraftHandler(pool: Pool) {
  return async function handleResumeDraft(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const draftId = Number(req.params.id);
      if (Number.isNaN(draftId)) throw validationError("Invalid draft id", ["id"]);
      const userId = Number((req as AuthedRequest).auth?.sub);

      const result = await runInTransaction(pool, async (tx) => {
        const draft = await getDraftByIdForUpdate(tx, draftId);
        if (!draft) throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");
        const season = await getSeasonById(tx, draft.season_id);
        if (!season || season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }
        const league = await getLeagueById(tx, season.league_id);
        if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
        // Multi-ceremony: drafting is scoped to the ceremony attached to this season.
        const leagueMember = await getLeagueMember(tx, league.id, userId);
        const isCommissioner = requireCommissionerOrOwner(userId, league, leagueMember);
        if (!isCommissioner) {
          throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
        }
        if (draft.status !== "PAUSED") {
          throw new AppError("DRAFT_NOT_PAUSED", 409, "Draft is not paused");
        }

        let transitioned;
        try {
          transitioned = transitionDraftState(
            {
              id: draft.id,
              status: draft.status,
              started_at: draft.started_at,
              completed_at: draft.completed_at
            },
            "IN_PROGRESS"
          );
        } catch (err) {
          const mapped = mapDraftStateError(err);
          if (mapped) {
            throw new AppError("INVALID_STATE", 400, mapped.message);
          }
          throw err;
        }

        let timerUpdated = null;
        if (draft.pick_timer_seconds) {
          const remainingMs = draft.pick_timer_remaining_ms;
          // Defensive: if a paused draft has no usable remaining time, restart from full timer.
          const resumeMs =
            typeof remainingMs === "number" && remainingMs > 0
              ? remainingMs
              : draft.pick_timer_seconds * 1000;
          const deadline = computeDeadline(
            new Date(),
            draft.pick_timer_seconds ?? null,
            resumeMs
          );
          timerUpdated = await updateDraftTimer(tx, draft.id, deadline, null);
        }

        const updated = await updateDraftStatus(tx, draft.id, transitioned.status);
        if (!updated) throw new AppError("INTERNAL_ERROR", 500, "Failed to resume draft");
        const updatedDraft = {
          ...updated,
          pick_deadline_at: timerUpdated?.pick_deadline_at ?? draft.pick_deadline_at,
          pick_timer_remaining_ms: timerUpdated?.pick_timer_remaining_ms ?? null
        };

        const event = await createDraftEvent(tx, {
          draft_id: draft.id,
          event_type: "draft.resumed",
          payload: {
            draft: {
              id: updatedDraft.id,
              status: updatedDraft.status,
              current_pick_number: updatedDraft.current_pick_number,
              started_at: updatedDraft.started_at,
              completed_at: updatedDraft.completed_at,
              pick_deadline_at: updatedDraft.pick_deadline_at
            }
          }
        });

        return { draft: { ...updatedDraft, version: event.version }, event };
      });

      emitDraftEvent(result.event);
      return res.status(200).json({ draft: result.draft });
    } catch (err) {
      next(err);
    }
  };
}
