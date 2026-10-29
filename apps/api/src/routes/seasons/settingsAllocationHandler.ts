import type express from "express";
import type { Pool } from "pg";
import { AppError } from "../../errors.js";
import { idParam, seasonAllocationBodySchema } from "@fantasy-oscars/shared/schemas";
import { parseBody, parseParams } from "../../utils/validate.js";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { runInTransaction } from "../../data/db.js";
import {
  getLeagueById,
  getLeagueMember
} from "../../data/repositories/leagueRepository.js";
import {
  getSeasonById,
  updateSeasonRemainderStrategy
} from "../../data/repositories/seasonRepository.js";
import { getDraftBySeasonId } from "../../data/repositories/draftRepository.js";
import { ensureCommissioner } from "./helpers.js";

export function buildSeasonSettingsAllocationHandler(client: DbClient) {
  return async (
    req: AuthedRequest,
    res: express.Response,
    next: express.NextFunction
  ) => {
    try {
      const { id: seasonId } = parseParams(idParam, req.params, {
        message: "Invalid season id"
      });
      const actorId = Number(req.auth?.sub);
      if (!actorId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");
      const { remainder_strategy } = parseBody(seasonAllocationBodySchema, req.body);

      const result = await runInTransaction(client as Pool, async (tx) => {
        const season = await getSeasonById(tx, seasonId);
        if (!season) throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        const league = await getLeagueById(tx, season.league_id);
        if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
        const member = await getLeagueMember(tx, league.id, actorId);
        ensureCommissioner(member);

        const draft = await getDraftBySeasonId(tx, season.id);
        if (draft && draft.status !== "PENDING") {
          throw new AppError(
            "ALLOCATION_LOCKED",
            409,
            "Cannot change allocation after draft has started"
          );
        }

        const updated =
          (await updateSeasonRemainderStrategy(tx, season.id, remainder_strategy)) ??
          season;
        return { season: updated };
      });

      return res.status(200).json({ season: result.season });
    } catch (err) {
      next(err);
    }
  };
}
