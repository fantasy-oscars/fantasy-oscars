import type express from "express";
import type { DbClient } from "../../data/db.js";
import { buildCreateDraftHandler } from "./create.js";

export function registerDraftCreateRoute(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;
  router.post("/", buildCreateDraftHandler(client));
}
