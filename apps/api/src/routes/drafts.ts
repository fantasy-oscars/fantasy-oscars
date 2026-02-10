import express from "express";
import type { Router } from "express";
import type { DbClient } from "../data/db.js";
import { requireAuth } from "../auth/middleware.js";
import type { Pool } from "pg";
import {
  buildDraftResultsHandler as buildDraftResultsHandlerImpl,
  buildDraftStandingsHandler as buildDraftStandingsHandlerImpl,
  buildExportDraftHandler as buildExportDraftHandlerImpl
} from "./drafts/read.js";
import { buildCreateDraftHandler as buildCreateDraftHandlerImpl } from "./drafts/create.js";
import { buildStartDraftHandler as buildStartDraftHandlerImpl } from "./drafts/start.js";
import { buildSubmitPickHandler as buildSubmitPickHandlerImpl } from "./drafts/picks.js";
import {
  buildPauseDraftHandler as buildPauseDraftHandlerImpl,
  buildResumeDraftHandler as buildResumeDraftHandlerImpl
} from "./drafts/lifecycle.js";
import {
  buildOverrideDraftLockHandler as buildOverrideDraftLockHandlerImpl,
  buildSnapshotDraftHandler as buildSnapshotDraftHandlerImpl,
  buildTickDraftHandler as buildTickDraftHandlerImpl,
  tickDraft as tickDraftImpl
} from "./drafts/runtime.js";
import {
  buildGetDraftAutodraftHandler,
  buildUpsertDraftAutodraftHandler
} from "./drafts/autodraft.js";

export function buildCreateDraftHandler(client: DbClient) {
  return buildCreateDraftHandlerImpl(client);
}

export function buildStartDraftHandler(pool: Pool) {
  return buildStartDraftHandlerImpl(pool);
}

export function buildOverrideDraftLockHandler(pool: Pool) {
  return buildOverrideDraftLockHandlerImpl(pool);
}

export function buildPauseDraftHandler(pool: Pool) {
  return buildPauseDraftHandlerImpl(pool);
}

export function buildResumeDraftHandler(pool: Pool) {
  return buildResumeDraftHandlerImpl(pool);
}

export function buildSnapshotDraftHandler(pool: Pool) {
  return buildSnapshotDraftHandlerImpl(pool);
}

export function buildSubmitPickHandler(pool: Pool) {
  return buildSubmitPickHandlerImpl(pool);
}

export function buildExportDraftHandler(pool: Pool) {
  return buildExportDraftHandlerImpl(pool);
}

export function buildDraftResultsHandler(pool: Pool) {
  return buildDraftResultsHandlerImpl(pool);
}

export function buildDraftStandingsHandler(pool: Pool) {
  return buildDraftStandingsHandlerImpl(pool);
}

export async function tickDraft(pool: Pool, draftId: number) {
  return await tickDraftImpl(pool, draftId);
}

export function buildTickDraftHandler(pool: Pool) {
  return buildTickDraftHandlerImpl(pool);
}

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
