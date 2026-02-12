import type express from "express";
import type { DbClient } from "../../data/db.js";
import { registerSeasonSettingsScoringLegacyRoute } from "./settingsScoringLegacyRoute.js";
import { registerSeasonSettingsScoringSeasonRoute } from "./settingsScoringSeasonRoute.js";

export function registerSeasonSettingsScoringRoutes(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;
  registerSeasonSettingsScoringSeasonRoute({ router, client });
  registerSeasonSettingsScoringLegacyRoute({ router, client });
}
