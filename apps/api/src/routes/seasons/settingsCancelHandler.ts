import type express from "express";
import type { Pool } from "pg";
import { AppError, validationError } from "../../errors.js";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { runInTransaction } from "../../data/db.js";
import { getLeagueById, getLeagueMember } from "../../data/repositories/leagueRepository.js";
import { cancelSeason, getSeasonById } from "../../data/repositories/seasonRepository.js";
import { createDraftEvent, getDraftBySeasonId } from "../../data/repositories/draftRepository.js";
import { emitDraftEvent } from "../../realtime/draftEvents.js";

export function buildSeasonSettingsCancelHandler(client: DbClient) {
  return async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
    try {
      const seasonId = Number(req.params.id);
      if (Number.isNaN(seasonId)) {
        throw validationError("Invalid season id", ["id"]);
      }
      const userId = Number(req.auth?.sub);
      if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

      const result = await runInTransaction(client as Pool, async (tx) => {
        const season = await getSeasonById(tx, seasonId);
        if (!season || season.status === "CANCELLED") {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }
        const league = await getLeagueById(tx, season.league_id);
        if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
        const member = await getLeagueMember(tx, league.id, userId);
        const isCommissioner =
          league.created_by_user_id === userId ||
          (member && (member.role === "OWNER" || member.role === "CO_OWNER"));
        if (!isCommissioner) {
          throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
        }

        const draft = await getDraftBySeasonId(tx, season.id);
        if (draft && draft.status === "COMPLETED") {
          throw new AppError(
            "SEASON_CANNOT_CANCEL_COMPLETED",
            409,
            "Cannot cancel a season with a completed draft"
          );
        }

        const cancelled = await cancelSeason(tx, season.id);
        if (!cancelled) {
          throw new AppError("INTERNAL_ERROR", 500, "Failed to cancel season");
        }

        let event = null;
        if (draft) {
          event = await createDraftEvent(tx, {
            draft_id: draft.id,
            event_type: "season.cancelled",
            payload: { season_id: cancelled.id, draft_id: draft.id }
          });
        }

        return { season: cancelled, draft, event };
      });

      if (result.event) {
        emitDraftEvent(result.event);
      }

      return res.status(200).json({ season: result.season });
    } catch (err) {
      next(err);
    }
  };
}

