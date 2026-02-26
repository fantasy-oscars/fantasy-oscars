import type express from "express";
import type { Pool } from "pg";
import { AppError, validationError } from "../../errors.js";
import { requireAuth, type AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { query, runInTransaction } from "../../data/db.js";
import {
  getLeagueById,
  getLeagueMember
} from "../../data/repositories/leagueRepository.js";
import { createExtantSeason } from "../../data/repositories/seasonRepository.js";
import {
  createDraft,
  getDraftBySeasonId
} from "../../data/repositories/draftRepository.js";

export function registerLeagueSeasonsCreateRoute(args: {
  router: express.Router;
  client: DbClient;
  authSecret: string;
}): void {
  const { router, client, authSecret } = args;

  router.post(
    "/:id/seasons",
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
      try {
        const leagueId = Number(req.params.id);
        if (Number.isNaN(leagueId)) {
          throw validationError("Invalid league id", ["id"]);
        }
        const userId = Number(req.auth?.sub);
        if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const ceremonyIdRaw = req.body?.ceremony_id;
        const ceremonyId =
          ceremonyIdRaw === undefined || ceremonyIdRaw === null
            ? null
            : Number(ceremonyIdRaw);

        const scoringRaw = req.body?.scoring_strategy_name;
        const scoringStrategy =
          scoringRaw === undefined || scoringRaw === null ? "fixed" : String(scoringRaw);
        if (!["fixed", "negative", "category_weighted"].includes(scoringStrategy)) {
          throw validationError("Invalid scoring_strategy_name", [
            "scoring_strategy_name"
          ]);
        }

        const remainderRaw = req.body?.remainder_strategy;
        const remainderStrategy =
          remainderRaw === undefined || remainderRaw === null
            ? "UNDRAFTED"
            : String(remainderRaw);
        if (!["UNDRAFTED", "FULL_POOL"].includes(remainderStrategy)) {
          throw validationError("Invalid remainder_strategy", ["remainder_strategy"]);
        }

        const timerRaw = req.body?.pick_timer_seconds;
        const pickTimerSeconds =
          timerRaw === undefined || timerRaw === null ? null : Number(timerRaw);
        if (
          pickTimerSeconds !== null &&
          (!Number.isFinite(pickTimerSeconds) || pickTimerSeconds < 0)
        ) {
          throw validationError("Invalid pick_timer_seconds", ["pick_timer_seconds"]);
        }

        // Multi-ceremony: season creation must explicitly choose a ceremony.
        if (!ceremonyId || Number.isNaN(Number(ceremonyId))) {
          throw new AppError(
            "CEREMONY_REQUIRED",
            409,
            "Ceremony is required to create a season"
          );
        }

        const ceremonyIdNum = Number(ceremonyId);
        const { rows: ceremonyRows } = await query<{ status: string }>(
          client,
          `SELECT status FROM ceremony WHERE id = $1`,
          [ceremonyIdNum]
        );
        const ceremonyStatus = ceremonyRows[0]?.status;
        if (!ceremonyStatus) {
          throw new AppError("CEREMONY_NOT_FOUND", 404, "Ceremony not found");
        }
        if (ceremonyStatus === "LOCKED") {
          throw new AppError("CEREMONY_LOCKED", 409, "Ceremony is locked");
        }
        if (ceremonyStatus !== "PUBLISHED") {
          throw new AppError("CEREMONY_NOT_PUBLISHED", 409, "Ceremony is not published");
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const league = await getLeagueById(tx, leagueId);
          if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");

          const member = await getLeagueMember(tx, leagueId, userId);
          const isCommissioner =
            league.created_by_user_id === userId ||
            (member && (member.role === "OWNER" || member.role === "CO_OWNER"));
          if (!isCommissioner) {
            throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
          }

          // Strongly enforce: one extant season per ceremony per league.
          const { rows: existingRows } = await query<{ id: number }>(
            tx,
            `SELECT id::int FROM season WHERE league_id = $1 AND ceremony_id = $2 AND status = 'EXTANT' LIMIT 1`,
            [leagueId, ceremonyIdNum]
          );
          if (existingRows[0]?.id) {
            throw new AppError(
              "SEASON_EXISTS",
              409,
              "An active season already exists for this ceremony"
            );
          }

          const season = await createExtantSeason(tx, {
            league_id: leagueId,
            ceremony_id: ceremonyIdNum
          });

          // Ensure the creator is always a season commissioner for the season they create.
          await query(
            tx,
            `INSERT INTO season_member (season_id, user_id, league_member_id, role)
             VALUES ($1, $2, $3, 'OWNER')
             ON CONFLICT (season_id, user_id)
             DO UPDATE SET
               role = 'OWNER',
               league_member_id = COALESCE(EXCLUDED.league_member_id, season_member.league_member_id)`,
            [season.id, userId, member?.id ?? null]
          );

          // Apply creation-time defaults (editable later).
          await query(
            tx,
            `UPDATE season SET scoring_strategy_name = $2, remainder_strategy = $3 WHERE id = $1`,
            [season.id, scoringStrategy, remainderStrategy]
          );
          season.scoring_strategy_name = scoringStrategy as
            | "fixed"
            | "negative"
            | "category_weighted";
          season.remainder_strategy = remainderStrategy as "UNDRAFTED" | "FULL_POOL";

          const existingDraft = await getDraftBySeasonId(tx, season.id);
          if (existingDraft) {
            // Shouldn't happen for a new season, but keep it safe.
            return { season, draft: existingDraft };
          }

          const draft = await createDraft(tx, {
            league_id: leagueId,
            season_id: season.id,
            status: "PENDING",
            draft_order_type: "SNAKE",
            current_pick_number: null,
            started_at: null,
            completed_at: null,
            remainder_strategy: remainderStrategy as "UNDRAFTED" | "FULL_POOL",
            pick_timer_seconds:
              pickTimerSeconds && pickTimerSeconds > 0
                ? Math.floor(pickTimerSeconds)
                : null,
            auto_pick_strategy:
              pickTimerSeconds && pickTimerSeconds > 0 ? "RANDOM_SEED" : null
          });

          return { season, draft };
        });

        return res.status(201).json({ season: result.season, draft: result.draft });
      } catch (err) {
        next(err);
      }
    }
  );
}
