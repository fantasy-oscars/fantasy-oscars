import type express from "express";
import type { DbClient } from "../../data/db.js";
import { buildSeasonSettingsAllocationHandler } from "./settingsAllocationHandler.js";

export function registerSeasonSettingsAllocationLegacyRoute(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;
  router.post("/:id/allocation", buildSeasonSettingsAllocationHandler(client));
}

