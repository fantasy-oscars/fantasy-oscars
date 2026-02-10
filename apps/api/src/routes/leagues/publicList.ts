import type express from "express";
import { requireAuth, type AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { listPublicLeagues } from "../../data/repositories/leagueRepository.js";

export function registerLeaguePublicListRoute(args: {
  router: express.Router;
  client: DbClient;
  authSecret: string;
}): void {
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
}

