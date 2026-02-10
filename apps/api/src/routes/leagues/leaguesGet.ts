import type express from "express";
import { requireAuth, type AuthedRequest } from "../../auth/middleware.js";
import { AppError, validationError } from "../../errors.js";
import type { DbClient } from "../../data/db.js";
import { getLeagueById } from "../../data/repositories/leagueRepository.js";

export function registerLeaguesGetRoute(args: {
  router: express.Router;
  client: DbClient;
  authSecret: string;
}): void {
  const { router, client, authSecret } = args;

  router.get("/:id", requireAuth(authSecret), async (req: AuthedRequest, res, next) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        throw validationError("Invalid league id", ["id"]);
      }
      const league = await getLeagueById(client, id);
      if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
      return res.json({ league });
    } catch (err) {
      next(err);
    }
  });
}

