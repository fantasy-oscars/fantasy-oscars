import type express from "express";
import type { Pool } from "pg";
import { buildStartDraftHandler } from "./start.js";

export function registerDraftStartRoute(args: {
  router: express.Router;
  pool: Pool;
}): void {
  const { router, pool } = args;
  router.post("/:id/start", buildStartDraftHandler(pool));
}
