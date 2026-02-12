import type express from "express";
import type { DbClient } from "../../data/db.js";
import { registerSeasonSettingsAllocationRoutes } from "./settingsAllocation.js";
import { registerSeasonSettingsCancelRoutes } from "./settingsCancel.js";
import { registerSeasonSettingsScoringRoutes } from "./settingsScoring.js";
import { registerSeasonSettingsTimerRoutes } from "./settingsTimer.js";

export function registerSeasonSettingsRoutes(args: {
  router: express.Router;
  client: DbClient;
}) {
  const { router, client } = args;
  registerSeasonSettingsCancelRoutes({ router, client });
  registerSeasonSettingsScoringRoutes({ router, client });
  registerSeasonSettingsAllocationRoutes({ router, client });
  registerSeasonSettingsTimerRoutes({ router, client });
}
