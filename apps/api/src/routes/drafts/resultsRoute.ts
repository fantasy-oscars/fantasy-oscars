import type express from "express";
import type { Pool } from "pg";
import { buildDraftResultsHandler } from "./read.js";

export function registerDraftResultsRoute(args: { router: express.Router; pool: Pool }): void {
  const { router, pool } = args;
  router.post("/:id/results", buildDraftResultsHandler(pool));
}

