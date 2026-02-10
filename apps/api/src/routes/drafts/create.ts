import express from "express";
import { AppError, validationError } from "../../errors.js";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { query } from "../../data/db.js";
import {
  createDraft,
  getDraftBySeasonId
} from "../../data/repositories/draftRepository.js";
import { getLeagueById, getLeagueMember } from "../../data/repositories/leagueRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";

export function buildCreateDraftHandler(client: DbClient) {
  return async function handleCreateDraft(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const { league_id, draft_order_type, pick_timer_seconds } = req.body ?? {};
      const seasonIdRaw = (req.body ?? {}).season_id;

      const leagueIdNum = Number(league_id);
      if (!league_id || Number.isNaN(leagueIdNum)) {
        throw validationError("Missing or invalid league_id", ["league_id"]);
      }

      const order = (draft_order_type ?? "SNAKE").toUpperCase();
      if (order !== "SNAKE") {
        throw validationError("Invalid draft_order_type (MVP supports SNAKE only)", [
          "draft_order_type"
        ]);
      }
      if (
        pick_timer_seconds !== undefined &&
        pick_timer_seconds !== null &&
        (!Number.isFinite(Number(pick_timer_seconds)) || Number(pick_timer_seconds) < 0)
      ) {
        throw validationError("Invalid pick_timer_seconds", ["pick_timer_seconds"]);
      }
      const pickTimerSecondsNum =
        pick_timer_seconds === undefined || pick_timer_seconds === null
          ? null
          : Number(pick_timer_seconds);
      const autoPickStrategy =
        pickTimerSecondsNum && pickTimerSecondsNum > 0 ? "RANDOM_SEED" : null;

      const league = await getLeagueById(client, leagueIdNum);
      if (!league) {
        throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
      }

      // Create a draft for a specific season (supports leagues with multiple seasons/ceremonies).
      // A league can have multiple extant seasons (one per ceremony), so `season_id` is required.
      if (seasonIdRaw !== undefined && seasonIdRaw !== null) {
        const seasonIdNum = Number(seasonIdRaw);
        if (!Number.isFinite(seasonIdNum) || seasonIdNum <= 0) {
          throw validationError("Invalid season_id", ["season_id"]);
        }
        const season = await getSeasonById(client, seasonIdNum);
        if (!season || season.league_id !== leagueIdNum) {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }
        if (season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_ACTIVE", 409, "Season is not active");
        }

        const { rows: ceremonyRows } = await query<{
          status: string;
          draft_locked_at: Date | null;
        }>(client, `SELECT status, draft_locked_at FROM ceremony WHERE id = $1`, [
          season.ceremony_id
        ]);
        const ceremony = ceremonyRows[0];
        if (!ceremony) {
          throw new AppError("CEREMONY_NOT_FOUND", 404, "Ceremony not found");
        }
        const isLocked =
          ceremony.draft_locked_at != null ||
          String(ceremony.status).toUpperCase() === "LOCKED" ||
          String(ceremony.status).toUpperCase() === "ARCHIVED";
        if (isLocked) {
          throw new AppError("CEREMONY_LOCKED", 409, "Ceremony is locked");
        }
        if (String(ceremony.status).toUpperCase() !== "PUBLISHED") {
          throw new AppError("CEREMONY_NOT_PUBLISHED", 409, "Ceremony is not published");
        }

        const userId = Number((req as AuthedRequest).auth?.sub);
        const leagueMember = await getLeagueMember(client, leagueIdNum, userId);
        const isCommissioner =
          league.created_by_user_id === userId ||
          (leagueMember &&
            (leagueMember.role === "OWNER" || leagueMember.role === "CO_OWNER"));
        if (!isCommissioner) {
          throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
        }

        const existing = await getDraftBySeasonId(client, season.id);
        if (existing) {
          throw new AppError("DRAFT_EXISTS", 409, "Draft already exists for this season");
        }

        const draft = await createDraft(client, {
          league_id: leagueIdNum,
          season_id: season.id,
          status: "PENDING",
          draft_order_type: "SNAKE",
          current_pick_number: null,
          started_at: null,
          completed_at: null,
          remainder_strategy: season.remainder_strategy ?? "UNDRAFTED",
          pick_timer_seconds:
            pickTimerSecondsNum && pickTimerSecondsNum > 0
              ? Math.floor(pickTimerSecondsNum)
              : null,
          auto_pick_strategy: autoPickStrategy
        });

        return res.status(201).json({ draft });
      }
      throw validationError("Missing season_id", ["season_id"]);
    } catch (err) {
      next(err);
    }
  };
}

