import type express from "express";
import type { Pool } from "pg";
import { AppError, validationError } from "../../errors.js";
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
      const seasonId = Number(req.params.id);
      const { remainder_strategy } = req.body ?? {};
      const actorId = Number(req.auth?.sub);
      if (Number.isNaN(seasonId) || !actorId) {
        throw validationError("Invalid season id", ["id"]);
      }
      if (!["UNDRAFTED", "FULL_POOL"].includes(remainder_strategy)) {
        throw validationError("Invalid remainder_strategy", ["remainder_strategy"]);
      }

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
          (await updateSeasonRemainderStrategy(
            tx,
            season.id,
            remainder_strategy as "UNDRAFTED" | "FULL_POOL"
          )) ?? season;
        return { season: updated };
      });

      return res.status(200).json({ season: result.season });
    } catch (err) {
      next(err);
    }
  };
}
