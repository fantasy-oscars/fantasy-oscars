import express from "express";
import type { Router } from "express";
import { requireAuth } from "../auth/middleware.js";
import type { DbClient } from "../data/db.js";
import { createRateLimitGuard } from "../utils/rateLimitMiddleware.js";
import { registerSeasonInviteRoutes } from "./seasons/invites.js";
import { registerSeasonPublicRoutes } from "./seasons/public.js";
import { registerSeasonSettingsRoutes } from "./seasons/settings.js";
import { registerSeasonMemberRoutes } from "./seasons/members.js";
import { registerSeasonsLeaguesSeasonsCreateRoute } from "./seasons/leaguesSeasonsCreate.js";
import { registerSeasonsLeaguesSeasonsListRoute } from "./seasons/leaguesSeasonsList.js";

export function createSeasonsRouter(client: DbClient, authSecret: string): Router {
  const router = express.Router();

  router.use(requireAuth(authSecret));

  const inviteClaimLimiter = createRateLimitGuard({
    windowMs: 60_000,
    max: 10,
    key: (req) => req.ip ?? "unknown"
  });

  const publicSeasonJoinLimiter = createRateLimitGuard({
    windowMs: 5 * 60_000,
    max: 8,
    key: (req) => req.ip ?? "unknown"
  });

  registerSeasonInviteRoutes({ router, client, inviteClaimLimiter });
  registerSeasonPublicRoutes({ router, client, publicSeasonJoinLimiter });
  registerSeasonSettingsRoutes({ router, client });
  registerSeasonMemberRoutes({ router, client });

  // public season routes registered above
  registerSeasonsLeaguesSeasonsCreateRoute({ router, client });
  registerSeasonsLeaguesSeasonsListRoute({ router, client });

  return router;
}
