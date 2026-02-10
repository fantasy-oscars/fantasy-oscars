import type express from "express";
import type { Pool } from "pg";
import { AppError, validationError } from "../../errors.js";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { query, runInTransaction } from "../../data/db.js";
import { getLeagueById, getLeagueMember } from "../../data/repositories/leagueRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { getDraftBySeasonId } from "../../data/repositories/draftRepository.js";
import { ensureCommissioner } from "./helpers.js";

export function registerSeasonSettingsTimerRoutes(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;

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
      if (pickTimerSeconds !== null && (!Number.isFinite(pickTimerSeconds) || pickTimerSeconds < 0)) {
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
          throw new AppError("TIMER_LOCKED", 409, "Cannot change timer after draft has started");
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

