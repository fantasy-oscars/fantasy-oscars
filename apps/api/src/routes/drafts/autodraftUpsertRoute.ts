import type express from "express";
import type { Pool } from "pg";
import { buildUpsertDraftAutodraftHandler } from "./autodraft.js";

export function registerDraftAutodraftUpsertRoute(args: {
  router: express.Router;
  pool: Pool;
}): void {
  const { router, pool } = args;
  router.post("/:id/autodraft", buildUpsertDraftAutodraftHandler(pool));
}
