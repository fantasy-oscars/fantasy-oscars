import type express from "express";
import type { DbClient } from "../../data/db.js";
import { registerLeagueSeasonsCreateRoute } from "./seasonsCreate.js";
import { registerLeagueSeasonsListRoute } from "./seasonsList.js";

export function registerLeagueSeasonRoutes(args: {
  router: express.Router;
  client: DbClient;
  authSecret: string;
}) {
  const { router, client, authSecret } = args;
  registerLeagueSeasonsListRoute({ router, client, authSecret });
  registerLeagueSeasonsCreateRoute({ router, client, authSecret });
}
