import express from "express";
import type { Router } from "express";
import type { DbClient } from "../data/db.js";
import { requireAuth } from "../auth/middleware.js";
import type { Pool } from "pg";
import {
  buildDraftResultsHandler,
  buildDraftStandingsHandler,
  buildExportDraftHandler
} from "./drafts/read.js";
import { buildCreateDraftHandler } from "./drafts/create.js";
import { buildStartDraftHandler } from "./drafts/start.js";
import { buildSubmitPickHandler } from "./drafts/picks.js";
import {
  buildPauseDraftHandler,
  buildResumeDraftHandler
} from "./drafts/lifecycle.js";
import {
  buildOverrideDraftLockHandler,
  buildSnapshotDraftHandler,
  buildTickDraftHandler
} from "./drafts/runtime.js";
import {
  buildGetDraftAutodraftHandler,
  buildUpsertDraftAutodraftHandler
} from "./drafts/autodraft.js";

// Test helpers; keep these re-exports stable.
export { buildCreateDraftHandler } from "./drafts/create.js";
export {
  buildDraftResultsHandler,
  buildDraftStandingsHandler,
  buildExportDraftHandler
} from "./drafts/read.js";
export { buildSubmitPickHandler } from "./drafts/picks.js";
export { buildPauseDraftHandler, buildResumeDraftHandler } from "./drafts/lifecycle.js";
export { buildSnapshotDraftHandler } from "./drafts/runtime.js";

export function createDraftsRouter(client: DbClient, authSecret: string): Router {
  const router = express.Router();

  router.use(requireAuth(authSecret));
  router.post("/", buildCreateDraftHandler(client));
  router.post("/:id/start", buildStartDraftHandler(client as Pool));
  router.post("/:id/override-lock", buildOverrideDraftLockHandler(client as Pool));
  router.post("/:id/pause", buildPauseDraftHandler(client as Pool));
  router.post("/:id/resume", buildResumeDraftHandler(client as Pool));
  router.post("/:id/tick", buildTickDraftHandler(client as Pool));
  router.get("/:id/snapshot", buildSnapshotDraftHandler(client as Pool));
  router.get("/:id/export", buildExportDraftHandler(client as Pool));
  router.post("/:id/results", buildDraftResultsHandler(client as Pool));
  router.get("/:id/standings", buildDraftStandingsHandler(client as Pool));
  router.post("/:id/picks", buildSubmitPickHandler(client as unknown as Pool));

  // Per-user auto-draft preferences for this draft.
  router.get("/:id/autodraft", buildGetDraftAutodraftHandler(client));
  router.post("/:id/autodraft", buildUpsertDraftAutodraftHandler(client as Pool));

  return router;
}
