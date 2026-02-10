import type express from "express";
import { requireAuth, type AuthedRequest } from "../../auth/middleware.js";
import { AppError } from "../../errors.js";
import type { DbClient } from "../../data/db.js";
import { listLeaguesForUser } from "../../data/repositories/leagueRepository.js";

export function registerLeaguesListRoute(args: {
  router: express.Router;
  client: DbClient;
  authSecret: string;
}): void {
  const { router, client, authSecret } = args;

  router.get("/", requireAuth(authSecret), async (req: AuthedRequest, res, next) => {
    try {
      const userId = Number(req.auth?.sub);
      if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");
      const leagues = await listLeaguesForUser(client, userId);
      return res.json({ leagues });
    } catch (err) {
      next(err);
    }
  });
}

