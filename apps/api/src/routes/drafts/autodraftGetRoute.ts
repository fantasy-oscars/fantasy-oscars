import type express from "express";
import type { DbClient } from "../../data/db.js";
import { buildGetDraftAutodraftHandler } from "./autodraft.js";

export function registerDraftAutodraftGetRoute(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;
  router.get("/:id/autodraft", buildGetDraftAutodraftHandler(client));
}
