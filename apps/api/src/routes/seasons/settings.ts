import type express from "express";
import type { Pool } from "pg";
import { AppError, validationError } from "../../errors.js";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { query, runInTransaction } from "../../data/db.js";
import { getLeagueById, getLeagueMember } from "../../data/repositories/leagueRepository.js";
import {
  cancelSeason,
  getSeasonById,
  updateSeasonCategoryWeights,
  updateSeasonRemainderStrategy,
  updateSeasonScoringStrategy
} from "../../data/repositories/seasonRepository.js";
import {
  createDraftEvent,
  getDraftBySeasonId
} from "../../data/repositories/draftRepository.js";
import { emitDraftEvent } from "../../realtime/draftEvents.js";
import { ensureCommissioner } from "./helpers.js";

export function registerSeasonSettingsRoutes(args: {
  router: express.Router;
  client: DbClient;
}) {
  const { router, client } = args;

  const handleCancelSeason = async (
    req: AuthedRequest,
    res: express.Response,
    next: express.NextFunction
  ) => {
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
  router.post("/seasons/:id/cancel", handleCancelSeason);
  router.post("/:id/cancel", handleCancelSeason);

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
          for (const [k, v] of Object.entries(
            category_weights as Record<string, unknown>
          )) {
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

  const handleUpdateAllocation = async (
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
  router.post("/seasons/:id/allocation", handleUpdateAllocation);
  router.post("/:id/allocation", handleUpdateAllocation);

  const handleUpdateTimer = async (
    req: AuthedRequest,
    res: express.Response,
    next: express.NextFunction
  ) => {
    try {
      const seasonId = Number(req.params.id);
      const actorId = Number(req.auth?.sub);
      const timerRaw = (req.body ?? {}).pick_timer_seconds;
      const pickTimerSeconds =
        timerRaw === undefined || timerRaw === null ? null : Number(timerRaw);
      if (Number.isNaN(seasonId) || !actorId) {
        throw validationError("Invalid season id", ["id"]);
      }
      if (
        pickTimerSeconds !== null &&
        (!Number.isFinite(pickTimerSeconds) || pickTimerSeconds < 0)
      ) {
        throw validationError("Invalid pick_timer_seconds", ["pick_timer_seconds"]);
      }

      const result = await runInTransaction(client as Pool, async (tx) => {
        const season = await getSeasonById(tx, seasonId);
        if (!season) throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        const league = await getLeagueById(tx, season.league_id);
        if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
        const member = await getLeagueMember(tx, league.id, actorId);
        ensureCommissioner(member);

        const draft = await getDraftBySeasonId(tx, season.id);
        if (!draft) {
          throw new AppError("DRAFT_NOT_FOUND", 409, "Draft not created yet");
        }
        if (draft.status !== "PENDING") {
          throw new AppError(
            "TIMER_LOCKED",
            409,
            "Cannot change timer after draft has started"
          );
        }

        const nextSeconds =
          pickTimerSeconds && pickTimerSeconds > 0 ? Math.floor(pickTimerSeconds) : null;

        const { rows } = await query<{
          id: number;
          pick_timer_seconds: number | null;
          auto_pick_strategy: string | null;
        }>(
          tx,
          `
            UPDATE draft
            SET pick_timer_seconds = $2,
                auto_pick_strategy = $3,
                auto_pick_seed = NULL,
                auto_pick_config = NULL,
                pick_deadline_at = NULL,
                pick_timer_remaining_ms = NULL
            WHERE id = $1
            RETURNING
              id::int,
              pick_timer_seconds::int,
              auto_pick_strategy
          `,
          [draft.id, nextSeconds, nextSeconds ? "RANDOM_SEED" : null]
        );
        const updated = rows[0];
        if (!updated) {
          throw new AppError("INTERNAL_ERROR", 500, "Failed to update timer");
        }
        return { draft: updated };
      });

      return res.status(200).json({ draft: result.draft });
    } catch (err) {
      next(err);
    }
  };
  router.post("/seasons/:id/timer", handleUpdateTimer);
  router.post("/:id/timer", handleUpdateTimer);
}

