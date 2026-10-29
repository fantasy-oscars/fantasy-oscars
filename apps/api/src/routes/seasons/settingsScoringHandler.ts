import type express from "express";
import type { Pool } from "pg";
import { AppError } from "../../errors.js";
import { idParam, seasonScoringBodySchema } from "@fantasy-oscars/shared/schemas";
import { parseBody, parseParams } from "../../utils/validate.js";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { query, runInTransaction } from "../../data/db.js";
import {
  getLeagueById,
  getLeagueMember
} from "../../data/repositories/leagueRepository.js";
import {
  getSeasonById,
  updateSeasonCategoryWeights,
  updateSeasonScoringStrategy
} from "../../data/repositories/seasonRepository.js";
import { getDraftBySeasonId } from "../../data/repositories/draftRepository.js";
import { ensureCommissioner } from "./helpers.js";

export function buildSeasonSettingsScoringHandler(client: DbClient) {
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
      const { scoring_strategy_name, category_weights } = parseBody(
        seasonScoringBodySchema,
        req.body
      );

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
            "SEASON_SCORING_LOCKED",
            409,
            "Cannot change scoring after draft has started"
          );
        }

        let weightsToWrite: Record<string, number> | null = category_weights ?? null;

        // If switching into weighted scoring without an explicit weights payload, seed a safe default (1).
        if (scoring_strategy_name === "category_weighted" && weightsToWrite === null) {
          const { rows } = await query<{ id: number }>(
            tx,
            `SELECT id::int FROM category_edition WHERE ceremony_id = $1 ORDER BY sort_index ASC, id ASC`,
            [season.ceremony_id]
          );
          const seeded: Record<string, number> = {};
          for (const r of rows) seeded[String(r.id)] = 1;
          weightsToWrite = seeded;
        }

        const updatedSeason =
          (await updateSeasonScoringStrategy(tx, season.id, scoring_strategy_name)) ??
          season;

        const updated =
          weightsToWrite !== null
            ? ((await updateSeasonCategoryWeights(tx, season.id, weightsToWrite)) ??
              updatedSeason)
            : updatedSeason;

        return { season: updated };
      });

      return res.status(200).json({ season: result.season });
    } catch (err) {
      next(err);
    }
  };
}
