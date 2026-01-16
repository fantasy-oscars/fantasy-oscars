import express from "express";
import { AppError, validationError } from "../errors.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { getActiveCeremonyId } from "../data/repositories/appConfigRepository.js";
import { getLeagueById, getLeagueMember } from "../data/repositories/leagueRepository.js";
import {
  createSeason,
  getExtantSeasonForLeague,
  getMostRecentSeason,
  listSeasonsForLeague,
  cancelSeason,
  getSeasonById
} from "../data/repositories/seasonRepository.js";
import { runInTransaction } from "../data/db.js";
import type { DbClient } from "../data/db.js";
import type { Pool } from "pg";
import {
  createDraftEvent,
  getDraftBySeasonId
} from "../data/repositories/draftRepository.js";
import { emitDraftEvent } from "../realtime/draftEvents.js";

export function createSeasonsRouter(client: DbClient, authSecret: string) {
  const router = express.Router();

  router.use(requireAuth(authSecret));

  router.post(
    "/leagues/:id/seasons",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const leagueId = Number(req.params.id);
        if (Number.isNaN(leagueId)) {
          throw validationError("Invalid league id", ["id"]);
        }
        const userId = Number(req.auth?.sub);
        if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const activeCeremonyId = await getActiveCeremonyId(client);
        if (!activeCeremonyId) {
          throw new AppError(
            "ACTIVE_CEREMONY_NOT_SET",
            409,
            "Active ceremony is not configured"
          );
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

          const existing = await getExtantSeasonForLeague(tx, leagueId);
          if (existing && existing.ceremony_id === Number(activeCeremonyId)) {
            throw new AppError(
              "SEASON_EXISTS",
              409,
              "An active season already exists for this ceremony"
            );
          }

          const prior = await getMostRecentSeason(tx, leagueId);
          const season = await createSeason(tx, {
            league_id: leagueId,
            ceremony_id: Number(activeCeremonyId),
            status: "EXTANT"
          });

          // Participant seeding: league_member is season participation proxy; ensure at least commissioner present.
          if (!member) {
            // backfill commissioner membership if somehow missing
            // ownership is enforced in leagues routes; here keep non-fatal.
          }

          return { season, prior };
        });

        return res.status(201).json({ season: result.season });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/seasons/:id/cancel",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
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
    }
  );

  router.get(
    "/leagues/:id/seasons",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const leagueId = Number(req.params.id);
        if (Number.isNaN(leagueId)) {
          throw validationError("Invalid league id", ["id"]);
        }
        const userId = Number(req.auth?.sub);
        if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const league = await getLeagueById(client, leagueId);
        if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");

        const member = await getLeagueMember(client, leagueId, userId);
        if (!member) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");

        const activeCeremonyId = await getActiveCeremonyId(client);
        const includeCancelled =
          req.query.include_cancelled === "true" &&
          (req.auth as { is_admin?: boolean })?.is_admin === true;
        const seasons = await listSeasonsForLeague(client, leagueId, {
          includeCancelled
        });
        const response = seasons.map((s) => ({
          id: s.id,
          ceremony_id: s.ceremony_id,
          status: s.status,
          created_at: s.created_at,
          is_active_ceremony: activeCeremonyId
            ? Number(activeCeremonyId) === Number(s.ceremony_id)
            : false
        }));
        return res.json({ seasons: response });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
