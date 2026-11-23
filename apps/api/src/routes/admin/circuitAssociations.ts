import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { getCeremonyCircuits } from "../../services/circuit/circuitAdmin.js";
import {
  associateCeremony,
  moveCeremony,
  removeCeremony
} from "../../services/circuit/circuitEvents.js";
import {
  adminCeremonyIdParam,
  adminCeremonyCircuitParams,
  adminCircuitAssociationBody,
  adminCircuitCeremonyParams,
  adminCircuitCeremonyPositionBody
} from "@fantasy-oscars/shared/schemas";
import { parseBody, parseParams } from "../../utils/validate.js";
import { actorOf, confirmedOf } from "./circuitActor.js";

// The Circuit–ceremony association, managed from either admin screen. Both
// sides read and write the one circuit_ceremony table. Without a group the
// ceremony gets its own one-ceremony event. Placing a ceremony (into or out
// of a group, and its position) is done from the Circuit editor.
export function registerAdminCircuitAssociationRoutes(router: Router, pool: Pool) {
  router.put(
    "/circuits/:id/ceremonies/:ceremonyId",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id, ceremonyId } = parseParams(adminCircuitCeremonyParams, req.params);
        const { circuit_event_id } = parseBody(adminCircuitAssociationBody, req.body);
        const result = await associateCeremony(
          pool,
          { ...actorOf(req), via: "circuit" },
          {
            circuitId: id,
            ceremonyId,
            circuitEventId: circuit_event_id,
            confirmed: confirmedOf(req)
          }
        );
        return res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.put(
    "/circuits/:id/ceremonies/:ceremonyId/position",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id, ceremonyId } = parseParams(adminCircuitCeremonyParams, req.params);
        const { group_id, index } = parseBody(adminCircuitCeremonyPositionBody, req.body);
        const result = await moveCeremony(pool, actorOf(req), {
          circuitId: id,
          ceremonyId,
          groupId: group_id,
          index
        });
        return res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    "/circuits/:id/ceremonies/:ceremonyId",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id, ceremonyId } = parseParams(adminCircuitCeremonyParams, req.params);
        const result = await removeCeremony(
          pool,
          { ...actorOf(req), via: "circuit" },
          { circuitId: id, ceremonyId, confirmed: confirmedOf(req) }
        );
        return res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/ceremonies/:id/circuits",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id } = parseParams(adminCeremonyIdParam, req.params);
        return res.status(200).json(await getCeremonyCircuits(pool, id));
      } catch (err) {
        next(err);
      }
    }
  );

  router.put(
    "/ceremonies/:id/circuits/:circuitId",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id, circuitId } = parseParams(adminCeremonyCircuitParams, req.params);
        const { circuit_event_id } = parseBody(adminCircuitAssociationBody, req.body);
        const result = await associateCeremony(
          pool,
          { ...actorOf(req), via: "ceremony" },
          {
            circuitId,
            ceremonyId: id,
            circuitEventId: circuit_event_id,
            confirmed: confirmedOf(req)
          }
        );
        return res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    "/ceremonies/:id/circuits/:circuitId",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id, circuitId } = parseParams(adminCeremonyCircuitParams, req.params);
        const result = await removeCeremony(
          pool,
          { ...actorOf(req), via: "ceremony" },
          { circuitId, ceremonyId: id, confirmed: confirmedOf(req) }
        );
        return res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );
}
