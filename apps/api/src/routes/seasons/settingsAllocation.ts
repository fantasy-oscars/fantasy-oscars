import type express from "express";
import type { DbClient } from "../../data/db.js";
import { registerSeasonSettingsAllocationLegacyRoute } from "./settingsAllocationLegacyRoute.js";
import { registerSeasonSettingsAllocationSeasonRoute } from "./settingsAllocationSeasonRoute.js";

export function registerSeasonSettingsAllocationRoutes(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;
  registerSeasonSettingsAllocationSeasonRoute({ router, client });
  registerSeasonSettingsAllocationLegacyRoute({ router, client });
}
