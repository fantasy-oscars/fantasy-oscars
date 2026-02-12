import type express from "express";
import type { Pool } from "pg";
import { buildDraftStandingsHandler } from "./read.js";

export function registerDraftStandingsRoute(args: {
  router: express.Router;
  pool: Pool;
}): void {
  const { router, pool } = args;
  router.get("/:id/standings", buildDraftStandingsHandler(pool));
}
