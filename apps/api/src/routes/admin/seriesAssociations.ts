import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import {
  associateCeremony,
  getCeremonySeries,
  removeCeremony
} from "../../services/series/seriesAdmin.js";
import {
  adminCeremonyIdParam,
  adminCeremonySeriesParams,
  adminSeriesAssociationBody,
  adminSeriesCeremonyParams
} from "@fantasy-oscars/shared/schemas";
import { parseBody, parseParams } from "../../utils/validate.js";
import { actorOf } from "./seriesActor.js";

// The Series–ceremony association, managed from either admin screen. Both
// sides read and write the one series_ceremony table.
export function registerAdminSeriesAssociationRoutes(router: Router, pool: Pool) {
  router.put(
    "/series/:id/ceremonies/:ceremonyId",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id, ceremonyId } = parseParams(adminSeriesCeremonyParams, req.params);
        const { series_event_id } = parseBody(adminSeriesAssociationBody, req.body);
        const result = await associateCeremony(
          pool,
          { ...actorOf(req), via: "series" },
          { seriesId: id, ceremonyId, seriesEventId: series_event_id }
        );
        return res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    "/series/:id/ceremonies/:ceremonyId",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id, ceremonyId } = parseParams(adminSeriesCeremonyParams, req.params);
        const result = await removeCeremony(
          pool,
          { ...actorOf(req), via: "series" },
          { seriesId: id, ceremonyId }
        );
        return res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/ceremonies/:id/series",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id } = parseParams(adminCeremonyIdParam, req.params);
        return res.status(200).json(await getCeremonySeries(pool, id));
      } catch (err) {
        next(err);
      }
    }
  );

  router.put(
    "/ceremonies/:id/series/:seriesId",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id, seriesId } = parseParams(adminCeremonySeriesParams, req.params);
        const { series_event_id } = parseBody(adminSeriesAssociationBody, req.body);
        const result = await associateCeremony(
          pool,
          { ...actorOf(req), via: "ceremony" },
          { seriesId, ceremonyId: id, seriesEventId: series_event_id }
        );
        return res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    "/ceremonies/:id/series/:seriesId",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id, seriesId } = parseParams(adminCeremonySeriesParams, req.params);
        const result = await removeCeremony(
          pool,
          { ...actorOf(req), via: "ceremony" },
          { seriesId, ceremonyId: id }
        );
        return res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );
}
