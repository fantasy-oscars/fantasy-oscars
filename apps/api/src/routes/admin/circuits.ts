import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import {
  activate,
  createCircuit,
  getCircuitDetail,
  listCircuitsForAdmin
} from "../../services/circuit/circuitAdmin.js";
import {
  adminCircuitCreateBody,
  adminCircuitIdParam
} from "@fantasy-oscars/shared/schemas";
import { parseBody, parseParams } from "../../utils/validate.js";
import { actorOf } from "./circuitActor.js";
import { registerAdminCircuitAssociationRoutes } from "./circuitAssociations.js";
import { registerAdminCircuitCategoryRoutes } from "./circuitCategories.js";
import { registerAdminCircuitEventRoutes } from "./circuitEvents.js";
import { registerAdminCircuitMappingRoutes } from "./circuitMappings.js";

export function registerAdminCircuitRoutes(router: Router, client: DbClient) {
  const pool = client as Pool;

  router.get(
    "/circuits",
    async (_req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        return res.status(200).json({ circuits: await listCircuitsForAdmin(client) });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/circuits",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const body = parseBody(adminCircuitCreateBody, req.body);
        return res.status(201).json(await createCircuit(pool, actorOf(req), body));
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/circuits/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id } = parseParams(adminCircuitIdParam, req.params);
        return res.status(200).json(await getCircuitDetail(client, id));
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/circuits/:id/activate",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id } = parseParams(adminCircuitIdParam, req.params);
        return res.status(200).json(await activate(pool, actorOf(req), id));
      } catch (err) {
        next(err);
      }
    }
  );

  registerAdminCircuitAssociationRoutes(router, pool);
  registerAdminCircuitEventRoutes(router, pool);
  registerAdminCircuitCategoryRoutes(router, pool);
  registerAdminCircuitMappingRoutes(router, pool);
}
