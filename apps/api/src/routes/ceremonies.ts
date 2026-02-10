import express from "express";
import type { Router } from "express";
import type { DbClient } from "../data/db.js";
import { registerCeremoniesActiveRoute } from "./ceremoniesActive.js";
import { registerCeremoniesGetRoute } from "./ceremoniesGet.js";
import { registerCeremoniesIndexRoute } from "./ceremoniesIndex.js";
import { registerCeremoniesPublishedRoute } from "./ceremoniesPublished.js";

export function createCeremoniesRouter(client: DbClient): Router {
  const router = express.Router();

  registerCeremoniesIndexRoute({ router, client });
  registerCeremoniesActiveRoute({ router, client });
  registerCeremoniesPublishedRoute({ router, client });
  registerCeremoniesGetRoute({ router, client });

  return router;
}
