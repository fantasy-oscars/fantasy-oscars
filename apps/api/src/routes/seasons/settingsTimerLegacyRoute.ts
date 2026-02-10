import type express from "express";
import type { DbClient } from "../../data/db.js";
import { buildSeasonSettingsTimerHandler } from "./settingsTimerHandler.js";

export function registerSeasonSettingsTimerLegacyRoute(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;
  router.post("/:id/timer", buildSeasonSettingsTimerHandler(client));
}

