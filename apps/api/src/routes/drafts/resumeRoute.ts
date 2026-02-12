import type express from "express";
import type { Pool } from "pg";
import { buildResumeDraftHandler } from "./lifecycle.js";

export function registerDraftResumeRoute(args: {
  router: express.Router;
  pool: Pool;
}): void {
  const { router, pool } = args;
  router.post("/:id/resume", buildResumeDraftHandler(pool));
}
