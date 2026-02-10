import type express from "express";
import type { Pool } from "pg";
import { AppError, validationError } from "../../errors.js";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { query, runInTransaction } from "../../data/db.js";
import { getLeagueById, getLeagueMember } from "../../data/repositories/leagueRepository.js";
import {
  getSeasonById,
  updateSeasonCategoryWeights,
  updateSeasonScoringStrategy
} from "../../data/repositories/seasonRepository.js";
import { getDraftBySeasonId } from "../../data/repositories/draftRepository.js";
import { ensureCommissioner } from "./helpers.js";

export function registerSeasonSettingsScoringRoutes(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;

  const handleUpdateScoring = async (
    req: AuthedRequest,
    res: express.Response,
    next: express.NextFunction
  ) => {
    try {
      const seasonId = Number(req.params.id);
      const { scoring_strategy_name, category_weights } = req.body ?? {};
      const actorId = Number(req.auth?.sub);
      if (Number.isNaN(seasonId) || !actorId) {
        throw validationError("Invalid season id", ["id"]);
      }
      if (!["fixed", "negative", "category_weighted"].includes(scoring_strategy_name)) {
        throw validationError("Invalid scoring_strategy_name", ["scoring_strategy_name"]);
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
            "SEASON_SCORING_LOCKED",
            409,
            "Cannot change scoring after draft has started"
          );
        }

        let weightsToWrite: Record<string, number> | null = null;
        if (category_weights !== undefined) {
          if (category_weights === null || typeof category_weights !== "object") {
            throw validationError("Invalid category_weights", ["category_weights"]);
          }
          const next: Record<string, number> = {};
          for (const [k, v] of Object.entries(category_weights as Record<string, unknown>)) {
            const id = Number(k);
            const n = Number(v);
            if (!Number.isFinite(id) || id <= 0) {
              throw validationError("Invalid category_weights key", ["category_weights"]);
            }
            if (!Number.isInteger(n) || n < -99 || n > 99) {
              throw validationError(
                "Category weight must be an integer between -99 and 99",
                ["category_weights"]
              );
            }
            next[String(id)] = n;
          }
          weightsToWrite = next;
        }

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
          (await updateSeasonScoringStrategy(
            tx,
            season.id,
            scoring_strategy_name as "fixed" | "negative" | "category_weighted"
          )) ?? season;

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
  router.post("/seasons/:id/scoring", handleUpdateScoring);
  router.post("/:id/scoring", handleUpdateScoring);
}

