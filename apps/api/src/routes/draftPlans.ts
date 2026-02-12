import express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import { registerDraftPlanCreateRoute } from "./draftPlans/create.js";
import { registerDraftPlanGetRoute } from "./draftPlans/get.js";
import { registerDraftPlanItemsRoutes } from "./draftPlans/items.js";
import { registerDraftPlanListRoute } from "./draftPlans/list.js";

export function createDraftPlansRouter(pool: Pool, authSecret: string): Router {
  const router = express.Router();

  registerDraftPlanListRoute({ router, pool, authSecret });
  registerDraftPlanCreateRoute({ router, pool, authSecret });
  registerDraftPlanGetRoute({ router, pool, authSecret });
  registerDraftPlanItemsRoutes({ router, pool, authSecret });

  return router;
}
