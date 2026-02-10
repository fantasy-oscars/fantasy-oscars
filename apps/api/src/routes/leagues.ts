import express from "express";
import type { Router } from "express";
import type { DbClient } from "../data/db.js";
import { SlidingWindowRateLimiter } from "../utils/rateLimiter.js";
import { registerLeaguePublicRoutes } from "./leagues/public.js";
import { registerLeagueJoinRoutes } from "./leagues/join.js";
import { registerLeagueMemberRoutes } from "./leagues/members.js";
import { registerLeagueSeasonRoutes } from "./leagues/seasons.js";
import { registerLeaguesCreateRoute } from "./leagues/leaguesCreate.js";
import { registerLeaguesGetRoute } from "./leagues/leaguesGet.js";
import { registerLeaguesListRoute } from "./leagues/leaguesList.js";

const joinRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 8
});

export function createLeaguesRouter(client: DbClient, authSecret: string): Router {
  const router = express.Router();

  // League membership is invite-only for MVP; open joins are disabled.
  registerLeaguePublicRoutes({ router, client, authSecret });
  registerLeagueJoinRoutes({ router, client, authSecret, joinRateLimiter });
  registerLeagueMemberRoutes({ router, client, authSecret });
  registerLeagueSeasonRoutes({ router, client, authSecret });
  registerLeaguesCreateRoute({ router, client, authSecret });
  registerLeaguesGetRoute({ router, client, authSecret });
  registerLeaguesListRoute({ router, client, authSecret });

  return router;
}
