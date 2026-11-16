import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import {
  activate,
  createSeries,
  getSeriesDetail,
  listSeriesForAdmin
} from "../../services/series/seriesAdmin.js";
import {
  adminSeriesCreateBody,
  adminSeriesIdParam
} from "@fantasy-oscars/shared/schemas";
import { parseBody, parseParams } from "../../utils/validate.js";
import { actorOf } from "./seriesActor.js";
import { registerAdminSeriesAssociationRoutes } from "./seriesAssociations.js";
import { registerAdminSeriesMappingRoutes } from "./seriesMappings.js";

export function registerAdminSeriesRoutes(router: Router, client: DbClient) {
  const pool = client as Pool;

  router.get(
    "/series",
    async (_req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        return res.status(200).json({ series: await listSeriesForAdmin(client) });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/series",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const body = parseBody(adminSeriesCreateBody, req.body);
        return res.status(201).json(await createSeries(pool, actorOf(req), body));
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/series/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id } = parseParams(adminSeriesIdParam, req.params);
        return res.status(200).json(await getSeriesDetail(client, id));
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/series/:id/activate",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id } = parseParams(adminSeriesIdParam, req.params);
        return res.status(200).json(await activate(pool, actorOf(req), id));
      } catch (err) {
        next(err);
      }
    }
  );

  registerAdminSeriesAssociationRoutes(router, pool);
  registerAdminSeriesMappingRoutes(router, pool);
}
