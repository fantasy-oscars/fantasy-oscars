import express from "express";
import type { Router } from "express";
import { AppError, validationError } from "../../errors.js";
import type { DbClient } from "../../data/db.js";
import { getLeagueMember } from "../../data/repositories/leagueRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { getSeasonMember } from "../../data/repositories/seasonMemberRepository.js";
import { listPlaceholderInvites } from "../../data/repositories/seasonInviteRepository.js";
import { ensureCommissioner, sanitizeInvite } from "./helpers.js";
import type { AuthedRequest } from "../../auth/middleware.js";

export function registerSeasonInvitesListRoute(args: {
  router: Router;
  client: DbClient;
}): void {
  const { router, client } = args;

  router.get(
    "/:id/invites",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        if (Number.isNaN(seasonId)) {
          throw validationError("Invalid season id", ["id"]);
        }
        const userId = Number(req.auth?.sub);
        if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const season = await getSeasonById(client, seasonId);
        if (!season || season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }

        const member = await getSeasonMember(client, seasonId, userId);
        const leagueMember = member
          ? null
          : await getLeagueMember(client, season.league_id, userId);
        ensureCommissioner(member ?? leagueMember);

        const invites = await listPlaceholderInvites(client, seasonId);
        return res.status(200).json({ invites: invites.map(sanitizeInvite) });
      } catch (err) {
        next(err);
      }
    }
  );
}
