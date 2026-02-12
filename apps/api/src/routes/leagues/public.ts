import type express from "express";
import type { DbClient } from "../../data/db.js";
import { registerLeaguePublicGetRoute } from "./publicGet.js";
import { registerLeaguePublicListRoute } from "./publicList.js";

export function registerLeaguePublicRoutes(args: {
  router: express.Router;
  client: DbClient;
  authSecret: string;
}) {
  const { router, client, authSecret } = args;
  registerLeaguePublicListRoute({ router, client, authSecret });
  registerLeaguePublicGetRoute({ router, client, authSecret });
}
