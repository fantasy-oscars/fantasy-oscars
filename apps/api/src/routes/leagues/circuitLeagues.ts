import type express from "express";
import type { Pool } from "pg";
import { circuitLeagueCreateBody, idParam } from "@fantasy-oscars/shared/schemas";
import { requireAuth, type AuthedRequest } from "../../auth/middleware.js";
import { hasSuperAdminAccess } from "../../auth/roles.js";
import type { DbClient } from "../../data/db.js";
import {
  createCircuitLeague,
  listCircuitLeaguesInLeague
} from "../../services/circuit/circuitLeagues.js";
import { parseBody, parseParams } from "../../utils/validate.js";

// A league's Circuit competitions, listed beside its Seasons, and creating one.
export function registerLeagueCircuitRoutes(args: {
  router: express.Router;
  client: DbClient;
  authSecret: string;
}): void {
  const { router, client, authSecret } = args;

  router.get(
    "/:id/circuits",
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
      try {
        const { id } = parseParams(idParam, req.params);
        const viewer = {
          userId: Number(req.auth?.sub),
          isSuperAdmin: hasSuperAdminAccess(req.auth)
        };
        return res.status(200).json(await listCircuitLeaguesInLeague(client, id, viewer));
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/:id/circuits",
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
      try {
        const { id } = parseParams(idParam, req.params);
        const { circuit_id } = parseBody(circuitLeagueCreateBody, req.body);
        const viewer = {
          userId: Number(req.auth?.sub),
          isSuperAdmin: hasSuperAdminAccess(req.auth)
        };
        const detail = await createCircuitLeague(client as Pool, {
          leagueId: id,
          circuitId: circuit_id,
          viewer
        });
        return res.status(201).json(detail);
      } catch (err) {
        next(err);
      }
    }
  );
}
