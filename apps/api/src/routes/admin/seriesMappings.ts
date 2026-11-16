import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { removeMapping, setMapping } from "../../services/series/seriesAdmin.js";
import {
  adminSeriesMappingBody,
  adminSeriesMappingParams
} from "@fantasy-oscars/shared/schemas";
import { parseBody, parseParams } from "../../utils/validate.js";
import { actorOf } from "./seriesActor.js";

// Explicit mappings from a ceremony's category edition to a canonical Series
// category. Nothing infers a mapping from a category name.
export function registerAdminSeriesMappingRoutes(router: Router, pool: Pool) {
  router.put(
    "/series/:id/mappings/:categoryEditionId",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id, categoryEditionId } = parseParams(
          adminSeriesMappingParams,
          req.params
        );
        const { series_category_id } = parseBody(adminSeriesMappingBody, req.body);
        const result = await setMapping(pool, actorOf(req), {
          seriesId: id,
          categoryEditionId,
          seriesCategoryId: series_category_id
        });
        return res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    "/series/:id/mappings/:categoryEditionId",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id, categoryEditionId } = parseParams(
          adminSeriesMappingParams,
          req.params
        );
        await removeMapping(pool, actorOf(req), { seriesId: id, categoryEditionId });
        return res.status(204).end();
      } catch (err) {
        next(err);
      }
    }
  );
}
