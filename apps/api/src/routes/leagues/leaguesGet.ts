import type express from "express";
import { requireAuth, type AuthedRequest } from "../../auth/middleware.js";
import { idParam } from "@fantasy-oscars/shared/schemas";
import { AppError } from "../../errors.js";
import { parseParams } from "../../utils/validate.js";
import type { DbClient } from "../../data/db.js";
import {
  getLeagueById,
  getLeagueMember
} from "../../data/repositories/leagueRepository.js";
import { hasSuperAdminAccess } from "../../auth/roles.js";

export function registerLeaguesGetRoute(args: {
  router: express.Router;
  client: DbClient;
  authSecret: string;
}): void {
  const { router, client, authSecret } = args;

  router.get("/:id", requireAuth(authSecret), async (req: AuthedRequest, res, next) => {
    try {
      const { id } = parseParams(idParam, req.params, {
        message: "That link doesn't look right"
      });
      const league = await getLeagueById(client, id);
      if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
      if (!league.is_public && !hasSuperAdminAccess(req.auth)) {
        const userId = Number(req.auth?.sub);
        const member = userId ? await getLeagueMember(client, id, userId) : null;
        if (!member) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
      }
      return res.json({ league });
    } catch (err) {
      next(err);
    }
  });
}
