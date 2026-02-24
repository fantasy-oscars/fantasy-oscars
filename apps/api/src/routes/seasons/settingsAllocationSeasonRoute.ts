import type express from "express";
import type { DbClient } from "../../data/db.js";
import { buildSeasonSettingsAllocationHandler } from "./settingsAllocationHandler.js";

export function registerSeasonSettingsAllocationSeasonRoute(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;
  router.post("/seasons/:id/allocation", buildSeasonSettingsAllocationHandler(client));
}
