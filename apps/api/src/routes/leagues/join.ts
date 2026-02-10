import type express from "express";
import type { AuthedRequest } from "../../auth/middleware.js";
import { requireAuth } from "../../auth/middleware.js";
import { AppError, validationError } from "../../errors.js";
import type { DbClient } from "../../data/db.js";
import {
  createLeagueMember,
  getLeagueById,
  getLeagueMember
} from "../../data/repositories/leagueRepository.js";
import { listSeasonsForLeague } from "../../data/repositories/seasonRepository.js";
import { addSeasonMember } from "../../data/repositories/seasonMemberRepository.js";
import { runInTransaction } from "../../data/db.js";
import type { Pool } from "pg";

export function registerLeagueJoinRoutes(args: {
  router: express.Router;
  client: DbClient;
  authSecret: string;
  joinRateLimiter: { allow: (key: string) => boolean };
}) {
  const { router, client, authSecret, joinRateLimiter } = args;

  router.post(
    "/:id/join",
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
      try {
        if (!joinRateLimiter.allow(req.ip ?? "unknown")) {
          throw new AppError("RATE_LIMITED", 429, "Too many join attempts");
        }
        const leagueId = Number(req.params.id);
        const userId = Number(req.auth?.sub);
        if (Number.isNaN(leagueId) || Number.isNaN(userId)) {
          throw validationError("Invalid league id", ["id"]);
        }
        const result = await runInTransaction(client as Pool, async (tx) => {
          const league = await getLeagueById(tx, leagueId);
          if (!league) return new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
          if (league.is_public_season) {
            return new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
          }
          if (!league.is_public) {
            return new AppError(
              "INVITE_ONLY_MEMBERSHIP",
              410,
              "League membership is invite-only"
            );
          }
          const seasons = await listSeasonsForLeague(tx, leagueId, {
            includeCancelled: false
          });
          const season = seasons[0];
          if (!season) {
            return new AppError("SEASON_NOT_FOUND", 404, "No active season for league");
          }
          const { rows: lmRows } = await tx.query<{ count: string }>(
            `SELECT COUNT(*)::int AS count FROM league_member WHERE league_id = $1`,
            [leagueId]
          );
          const totalMembers = Number(lmRows[0]?.count ?? 0);
          if (totalMembers >= league.max_members) {
            return new AppError("LEAGUE_FULL", 409, "League is full");
          }

          let leagueMember = await getLeagueMember(tx, leagueId, userId);
          if (!leagueMember) {
            leagueMember = await createLeagueMember(tx, {
              league_id: leagueId,
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
          return { league, season };
        });
        if (result instanceof AppError) throw result;
        return res.status(200).json({ league: result.league, season: result.season });
      } catch (err) {
        next(err);
      }
    }
  );
}

