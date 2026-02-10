import express from "express";
import type { Router } from "express";
import type { DbClient } from "../data/db.js";
import { requireAuth } from "../auth/middleware.js";
import type { Pool } from "pg";
import { registerDraftAutodraftGetRoute } from "./drafts/autodraftGetRoute.js";
import { registerDraftAutodraftUpsertRoute } from "./drafts/autodraftUpsertRoute.js";
import { registerDraftCreateRoute } from "./drafts/createRoute.js";
import { registerDraftExportRoute } from "./drafts/exportRoute.js";
import { registerDraftOverrideLockRoute } from "./drafts/overrideLockRoute.js";
import { registerDraftPauseRoute } from "./drafts/pauseRoute.js";
import { registerDraftPicksRoute } from "./drafts/picksRoute.js";
import { registerDraftResultsRoute } from "./drafts/resultsRoute.js";
import { registerDraftResumeRoute } from "./drafts/resumeRoute.js";
import { registerDraftSnapshotRoute } from "./drafts/snapshotRoute.js";
import { registerDraftStandingsRoute } from "./drafts/standingsRoute.js";
import { registerDraftStartRoute } from "./drafts/startRoute.js";
import { registerDraftTickRoute } from "./drafts/tickRoute.js";

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
  const pool = client as unknown as Pool;
  registerDraftCreateRoute({ router, client });
  registerDraftStartRoute({ router, pool });
  registerDraftOverrideLockRoute({ router, pool });
  registerDraftPauseRoute({ router, pool });
  registerDraftResumeRoute({ router, pool });
  registerDraftTickRoute({ router, pool });
  registerDraftSnapshotRoute({ router, pool });
  registerDraftExportRoute({ router, pool });
  registerDraftResultsRoute({ router, pool });
  registerDraftStandingsRoute({ router, pool });
  registerDraftPicksRoute({ router, pool });
  registerDraftAutodraftGetRoute({ router, client });
  registerDraftAutodraftUpsertRoute({ router, pool });

  return router;
}
