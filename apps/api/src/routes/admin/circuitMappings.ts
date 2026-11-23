import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { removeMapping, setMapping } from "../../services/circuit/circuitAdmin.js";
import {
  adminCircuitMappingBody,
  adminCircuitMappingParams
} from "@fantasy-oscars/shared/schemas";
import { parseBody, parseParams } from "../../utils/validate.js";
import { actorOf, confirmedOf } from "./circuitActor.js";

// Explicit mappings from a ceremony's category edition to a Circuit category.
// Many ceremony categories may map to one Circuit category; a template match
// only pre-selects on the mapping screen, and nothing is inferred from names.
export function registerAdminCircuitMappingRoutes(router: Router, pool: Pool) {
  router.put(
    "/circuits/:id/mappings/:categoryEditionId",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id, categoryEditionId } = parseParams(
          adminCircuitMappingParams,
          req.params
        );
        const { circuit_category_id } = parseBody(adminCircuitMappingBody, req.body);
        const result = await setMapping(pool, actorOf(req), {
          circuitId: id,
          categoryEditionId,
          circuitCategoryId: circuit_category_id,
          confirmed: confirmedOf(req)
        });
        return res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    "/circuits/:id/mappings/:categoryEditionId",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id, categoryEditionId } = parseParams(
          adminCircuitMappingParams,
          req.params
        );
        await removeMapping(pool, actorOf(req), {
          circuitId: id,
          categoryEditionId,
          confirmed: confirmedOf(req)
        });
        return res.status(204).end();
      } catch (err) {
        next(err);
      }
    }
  );
}
