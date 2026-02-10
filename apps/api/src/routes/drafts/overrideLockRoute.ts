import type express from "express";
import type { Pool } from "pg";
import { buildOverrideDraftLockHandler } from "./runtime.js";

export function registerDraftOverrideLockRoute(args: {
  router: express.Router;
  pool: Pool;
}): void {
  const { router, pool } = args;
  router.post("/:id/override-lock", buildOverrideDraftLockHandler(pool));
}

