import type express from "express";
import type { Pool } from "pg";
import { buildExportDraftHandler } from "./read.js";

export function registerDraftExportRoute(args: {
  router: express.Router;
  pool: Pool;
}): void {
  const { router, pool } = args;
  router.get("/:id/export", buildExportDraftHandler(pool));
}
