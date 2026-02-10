import type express from "express";
import type { DbClient } from "../../data/db.js";
import { buildSeasonSettingsScoringHandler } from "./settingsScoringHandler.js";

export function registerSeasonSettingsScoringSeasonRoute(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;
  router.post("/seasons/:id/scoring", buildSeasonSettingsScoringHandler(client));
}

