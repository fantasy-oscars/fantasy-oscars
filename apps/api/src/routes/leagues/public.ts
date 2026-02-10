import type express from "express";
import { AppError, validationError } from "../../errors.js";
import { requireAuth, type AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import {
  getLeagueById,
  listPublicLeagues
} from "../../data/repositories/leagueRepository.js";
import { listSeasonsForLeague } from "../../data/repositories/seasonRepository.js";
import { listSeasonMembers } from "../../data/repositories/seasonMemberRepository.js";

export function registerLeaguePublicRoutes(args: {
  router: express.Router;
  client: DbClient;
  authSecret: string;
}) {
  const { router, client, authSecret } = args;

  router.get(
    "/public",
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
      try {
        const search = typeof req.query.q === "string" ? req.query.q.trim() : undefined;
        const leagues = await listPublicLeagues(client, { search });
        return res.json({ leagues });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/public/:id",
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
      try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) {
          throw validationError("Invalid league id", ["id"]);
        }
        const league = await getLeagueById(client, id);
        if (!league || !league.is_public) {
          throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
        }
        const seasons = await listSeasonsForLeague(client, id, {
          includeCancelled: false
        });
        if (seasons.length === 0) {
          throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
        }
        const activeSeason = seasons[0];
        const members = await listSeasonMembers(client, activeSeason.id);
        return res.json({
          league,
          season: activeSeason,
          member_count: members.length
        });
      } catch (err) {
        next(err);
      }
    }
  );
}

