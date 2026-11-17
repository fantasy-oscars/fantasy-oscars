import express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import {
  circuitLeagueCategoriesBody,
  circuitLeagueEventsBody,
  circuitLeagueSettingsBody,
  circuitDropBody,
  circuitFreeAgentBody,
  idAndUserIdParams,
  idParam
} from "@fantasy-oscars/shared/schemas";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { hasSuperAdminAccess } from "../auth/roles.js";
import {
  getCircuitLeagueDetail,
  initializeCircuitLeague,
  joinCircuitLeague,
  leaveCircuitLeague,
  setCircuitLeagueCategories,
  setCircuitLeagueEvents,
  updateCircuitLeagueSettingsFor,
  type Viewer
} from "../services/circuit/circuitLeagues.js";
import {
  addCircuitFreeAgent,
  dropCircuitSelection,
  getCircuitRoster,
  listCircuitLeagueTransactions
} from "../services/circuit/circuitOwnership.js";
import { parseBody, parseParams } from "../utils/validate.js";

// One Circuit competition in a league: its setup, members and initialisation,
// then rosters and transactions. Setup responses are the league's full detail
// and roster writes return the roster, so a screen can re-render from either.
export function createCircuitLeaguesRouter(pool: Pool, authSecret: string): Router {
  const router = express.Router();
  router.use(requireAuth(authSecret));

  const viewerOf = (req: AuthedRequest): Viewer => ({
    userId: Number(req.auth?.sub),
    isSuperAdmin: hasSuperAdminAccess(req.auth)
  });

  router.get("/:id", async (req: AuthedRequest, res, next) => {
    try {
      const { id } = parseParams(idParam, req.params);
      return res.status(200).json(await getCircuitLeagueDetail(pool, id, viewerOf(req)));
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:id/settings", async (req: AuthedRequest, res, next) => {
    try {
      const { id } = parseParams(idParam, req.params);
      const patch = parseBody(circuitLeagueSettingsBody, req.body);
      return res
        .status(200)
        .json(await updateCircuitLeagueSettingsFor(pool, id, viewerOf(req), patch));
    } catch (err) {
      next(err);
    }
  });

  router.put("/:id/events", async (req: AuthedRequest, res, next) => {
    try {
      const { id } = parseParams(idParam, req.params);
      const { events } = parseBody(circuitLeagueEventsBody, req.body);
      return res
        .status(200)
        .json(await setCircuitLeagueEvents(pool, id, viewerOf(req), events));
    } catch (err) {
      next(err);
    }
  });

  router.put("/:id/categories", async (req: AuthedRequest, res, next) => {
    try {
      const { id } = parseParams(idParam, req.params);
      const { categories } = parseBody(circuitLeagueCategoriesBody, req.body);
      return res
        .status(200)
        .json(await setCircuitLeagueCategories(pool, id, viewerOf(req), categories));
    } catch (err) {
      next(err);
    }
  });

  const actions = [
    ["/:id/join", joinCircuitLeague],
    ["/:id/leave", leaveCircuitLeague],
    ["/:id/initialize", initializeCircuitLeague]
  ] as const;

  for (const [path, action] of actions) {
    router.post(path, async (req: AuthedRequest, res, next) => {
      try {
        const { id } = parseParams(idParam, req.params);
        return res.status(200).json(await action(pool, id, viewerOf(req)));
      } catch (err) {
        next(err);
      }
    });
  }

  router.get("/:id/roster", async (req: AuthedRequest, res, next) => {
    try {
      const { id } = parseParams(idParam, req.params);
      return res.status(200).json(await getCircuitRoster(pool, id, viewerOf(req)));
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id/members/:userId/roster", async (req: AuthedRequest, res, next) => {
    try {
      const { id, userId } = parseParams(idAndUserIdParams, req.params);
      return res
        .status(200)
        .json(await getCircuitRoster(pool, id, viewerOf(req), userId));
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id/transactions", async (req: AuthedRequest, res, next) => {
    try {
      const { id } = parseParams(idParam, req.params);
      return res
        .status(200)
        .json(await listCircuitLeagueTransactions(pool, id, viewerOf(req)));
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/drops", async (req: AuthedRequest, res, next) => {
    try {
      const { id } = parseParams(idParam, req.params);
      const { selection_id } = parseBody(circuitDropBody, req.body);
      return res
        .status(200)
        .json(await dropCircuitSelection(pool, id, viewerOf(req), selection_id));
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/free-agents", async (req: AuthedRequest, res, next) => {
    try {
      const { id } = parseParams(idParam, req.params);
      const body = parseBody(circuitFreeAgentBody, req.body);
      return res.status(200).json(
        await addCircuitFreeAgent(pool, id, viewerOf(req), {
          selectionId: body.selection_id,
          dropSelectionId: body.drop_selection_id
        })
      );
    } catch (err) {
      next(err);
    }
  });

  return router;
}
