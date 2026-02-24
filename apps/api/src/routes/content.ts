import express from "express";
import type { Router } from "express";
import type { DbClient } from "../data/db.js";
import { registerContentBannersRoute } from "./content/banners.js";
import { registerContentDynamicRoute } from "./content/dynamic.js";
import { registerContentStaticRoute } from "./content/static.js";

export function createContentRouter(client: DbClient): Router {
  const router = express.Router();

  registerContentBannersRoute({ router, client });
  registerContentStaticRoute({ router, client });
  registerContentDynamicRoute({ router, client });

  return router;
}
