import type express from "express";
import type { DbClient } from "../../data/db.js";
import { buildSeasonSettingsCancelHandler } from "./settingsCancelHandler.js";

export function registerSeasonSettingsCancelSeasonRoute(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;
  router.post("/seasons/:id/cancel", buildSeasonSettingsCancelHandler(client));
}

