import type express from "express";
import type { DbClient } from "../../data/db.js";
import { buildSeasonSettingsScoringHandler } from "./settingsScoringHandler.js";

export function registerSeasonSettingsScoringRoute(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;
  router.post("/:id/scoring", buildSeasonSettingsScoringHandler(client));
}
