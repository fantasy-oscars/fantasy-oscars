import type express from "express";
import type { DbClient } from "../../data/db.js";
import { registerSeasonSettingsTimerLegacyRoute } from "./settingsTimerLegacyRoute.js";
import { registerSeasonSettingsTimerSeasonRoute } from "./settingsTimerSeasonRoute.js";

export function registerSeasonSettingsTimerRoutes(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;
  registerSeasonSettingsTimerSeasonRoute({ router, client });
  registerSeasonSettingsTimerLegacyRoute({ router, client });
}
