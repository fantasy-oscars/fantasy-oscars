import type express from "express";
import { AppError, validationError } from "../../errors.js";
import { requireAuth, type AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { getLeagueById, getLeagueMember, listLeagueRoster } from "../../data/repositories/leagueRepository.js";

export function registerLeagueMembersListRoute(args: {
  router: express.Router;
  client: DbClient;
  authSecret: string;
}): void {
  const { router, client, authSecret } = args;

  router.get(
    "/:id/members",
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
      try {
        const leagueId = Number(req.params.id);
        const userId = Number(req.auth?.sub);
        if (Number.isNaN(leagueId) || !userId) {
          throw validationError("Invalid league id", ["id"]);
        }

        const league = await getLeagueById(client, leagueId);
        if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
        const actor = await getLeagueMember(client, leagueId, userId);
        if (!actor || (actor.role !== "OWNER" && actor.role !== "CO_OWNER")) {
          throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
        }

        const members = await listLeagueRoster(client, leagueId);
        return res.json({ members });
      } catch (err) {
        next(err);
      }
    }
  );
}

