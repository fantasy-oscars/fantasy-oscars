import type express from "express";
import type { Pool } from "pg";
import { buildTickDraftHandler } from "./runtime.js";

export function registerDraftTickRoute(args: { router: express.Router; pool: Pool }): void {
  const { router, pool } = args;
  router.post("/:id/tick", buildTickDraftHandler(pool));
}

