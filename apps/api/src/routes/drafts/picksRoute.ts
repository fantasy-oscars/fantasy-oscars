import type express from "express";
import type { Pool } from "pg";
import { buildSubmitPickHandler } from "./picks.js";

export function registerDraftPicksRoute(args: {
  router: express.Router;
  pool: Pool;
}): void {
  const { router, pool } = args;
  router.post("/:id/picks", buildSubmitPickHandler(pool));
}
