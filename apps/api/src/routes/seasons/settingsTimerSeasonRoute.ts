import type express from "express";
import type { DbClient } from "../../data/db.js";
import { buildSeasonSettingsTimerHandler } from "./settingsTimerHandler.js";

export function registerSeasonSettingsTimerSeasonRoute(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;
  router.post("/seasons/:id/timer", buildSeasonSettingsTimerHandler(client));
}
