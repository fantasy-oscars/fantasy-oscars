import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import {
  createEvent,
  deleteEvent,
  reorderEventCeremonyOrder,
  reorderEvents,
  updateEvent
} from "../../services/circuit/circuitEvents.js";
import {
  adminCircuitEventCeremonyOrderBody,
  adminCircuitEventCreateBody,
  adminCircuitEventOrderBody,
  adminCircuitEventParams,
  adminCircuitEventUpdateBody,
  adminCircuitIdParam
} from "@fantasy-oscars/shared/schemas";
import { parseBody, parseParams } from "../../utils/validate.js";
import { actorOf } from "./circuitActor.js";

// Events: what leagues enable and weight as one unit. Creating one makes an
// admin-named group; single ceremonies get their own event automatically.
// Deleting an event ungroups its ceremonies.
export function registerAdminCircuitEventRoutes(router: Router, pool: Pool) {
  router.post(
    "/circuits/:id/events",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id } = parseParams(adminCircuitIdParam, req.params);
        const body = parseBody(adminCircuitEventCreateBody, req.body);
        const result = await createEvent(pool, actorOf(req), {
          circuitId: id,
          name: body.name,
          code: body.code,
          ceremonyIds: body.ceremony_ids
        });
        return res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.put(
    "/circuits/:id/events/order",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id } = parseParams(adminCircuitIdParam, req.params);
        const { event_ids } = parseBody(adminCircuitEventOrderBody, req.body);
        const result = await reorderEvents(pool, actorOf(req), {
          circuitId: id,
          eventIds: event_ids
        });
        return res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.put(
    "/circuits/:id/events/:eventId/ceremonies/order",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id, eventId } = parseParams(adminCircuitEventParams, req.params);
        const { ceremony_ids } = parseBody(adminCircuitEventCeremonyOrderBody, req.body);
        const result = await reorderEventCeremonyOrder(pool, actorOf(req), {
          circuitId: id,
          eventId,
          ceremonyIds: ceremony_ids
        });
        return res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.patch(
    "/circuits/:id/events/:eventId",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id, eventId } = parseParams(adminCircuitEventParams, req.params);
        const body = parseBody(adminCircuitEventUpdateBody, req.body);
        const result = await updateEvent(pool, actorOf(req), {
          circuitId: id,
          eventId,
          ...body
        });
        return res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    "/circuits/:id/events/:eventId",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id, eventId } = parseParams(adminCircuitEventParams, req.params);
        const result = await deleteEvent(pool, actorOf(req), { circuitId: id, eventId });
        return res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );
}
