import type express from "express";
import type { Pool } from "pg";
import { buildSnapshotDraftHandler } from "./runtime.js";

export function registerDraftSnapshotRoute(args: {
  router: express.Router;
  pool: Pool;
}): void {
  const { router, pool } = args;
  router.get("/:id/snapshot", buildSnapshotDraftHandler(pool));
}

