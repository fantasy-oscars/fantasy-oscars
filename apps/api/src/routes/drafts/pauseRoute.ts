import type express from "express";
import type { Pool } from "pg";
import { buildPauseDraftHandler } from "./lifecycle.js";

export function registerDraftPauseRoute(args: { router: express.Router; pool: Pool }): void {
  const { router, pool } = args;
  router.post("/:id/pause", buildPauseDraftHandler(pool));
}

