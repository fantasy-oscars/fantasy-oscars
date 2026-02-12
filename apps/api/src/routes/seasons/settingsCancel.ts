import type express from "express";
import type { DbClient } from "../../data/db.js";
import { registerSeasonSettingsCancelLegacyRoute } from "./settingsCancelLegacyRoute.js";
import { registerSeasonSettingsCancelSeasonRoute } from "./settingsCancelSeasonRoute.js";

export function registerSeasonSettingsCancelRoutes(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;
  registerSeasonSettingsCancelSeasonRoute({ router, client });
  registerSeasonSettingsCancelLegacyRoute({ router, client });
}
