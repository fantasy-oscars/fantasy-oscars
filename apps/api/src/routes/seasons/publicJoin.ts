import type express from "express";
import type { Pool } from "pg";
import { AppError, validationError } from "../../errors.js";
import type { AuthedRequest } from "../../auth/middleware.js";
import { getActiveCeremonyId } from "../../data/repositories/appConfigRepository.js";
import {
  createLeagueMember,
  getLeagueById,
  getLeagueMember
} from "../../data/repositories/leagueRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import type { DbClient } from "../../data/db.js";
import { runInTransaction } from "../../data/db.js";
import {
  addSeasonMember,
  countSeasonMembers,
  getSeasonMember
} from "../../data/repositories/seasonMemberRepository.js";

export function registerSeasonPublicJoinRoute(args: {
  router: express.Router;
  client: DbClient;
  publicSeasonJoinLimiter: { middleware: express.RequestHandler };
}): void {
  const { router, client, publicSeasonJoinLimiter } = args;

  router.post(
    "/public/:id/join",
    publicSeasonJoinLimiter.middleware,
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        const userId = Number(req.auth?.sub);
        if (Number.isNaN(seasonId) || !userId) {
          throw validationError("Invalid season id", ["id"]);
        }
        const activeCeremonyId = await getActiveCeremonyId(client);
        if (!activeCeremonyId) {
          throw new AppError(
            "ACTIVE_CEREMONY_NOT_SET",
            409,
            "Active ceremony is not configured"
          );
        }
        const result = await runInTransaction(client as Pool, async (tx) => {
          const season = await getSeasonById(tx, seasonId);
          if (!season || season.status !== "EXTANT") {
            return new AppError("SEASON_NOT_FOUND", 404, "Season not found");
          }
          const league = await getLeagueById(tx, season.league_id);
          if (!league || !league.is_public_season) {
            return new AppError("SEASON_NOT_FOUND", 404, "Season not found");
          }
          if (
            league.ceremony_id == null ||
            Number(league.ceremony_id) !== Number(activeCeremonyId)
          ) {
            return new AppError(
              "WRONG_CEREMONY",
              409,
              "Season is not for the active ceremony"
            );
          }
          const memberCount = await countSeasonMembers(tx, seasonId);
          if (memberCount >= league.max_members) {
            return new AppError("PUBLIC_SEASON_FULL", 409, "Public season is full");
          }
          const existingSeasonMember = await getSeasonMember(tx, seasonId, userId);
          if (existingSeasonMember) {
            return { league, season, existing: true };
          }
          let leagueMember = await getLeagueMember(tx, league.id, userId);
          if (!leagueMember) {
            leagueMember = await createLeagueMember(tx, {
              league_id: league.id,
              user_id: userId,
              role: "MEMBER"
            });
          }
          await addSeasonMember(tx, {
            season_id: season.id,
            user_id: userId,
            league_member_id: leagueMember.id,
            role: "MEMBER"
          });
          return { league, season, existing: false };
        });
        if (result instanceof AppError) throw result;
        return res.status(200).json({
          league: result.league,
          season: result.season,
          already_joined: result.existing
        });
      } catch (err) {
        next(err);
      }
    }
  );
}

