import type express from "express";
import type { DbClient } from "../../data/db.js";
import { registerSeasonSettingsAllocationRoute } from "./settingsAllocationRoute.js";
import { registerSeasonSettingsCancelRoute } from "./settingsCancelRoute.js";
import { registerSeasonSettingsScoringRoute } from "./settingsScoringRoute.js";
import { registerSeasonSettingsTimerRoute } from "./settingsTimerRoute.js";

export function registerSeasonSettingsRoutes(args: {
  router: express.Router;
  client: DbClient;
}) {
  const { router, client } = args;
  registerSeasonSettingsCancelRoute({ router, client });
  registerSeasonSettingsScoringRoute({ router, client });
  registerSeasonSettingsAllocationRoute({ router, client });
  registerSeasonSettingsTimerRoute({ router, client });
}
