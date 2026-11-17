import express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import {
  circuitLeagueCategoriesBody,
  circuitLeagueEventsBody,
  circuitLeagueSettingsBody,
  circuitDropBody,
  circuitFreeAgentBody,
  circuitQueueAddBody,
  circuitQueueItemParams,
  circuitQueueOrderBody,
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
import {
  getCircuitLeagueDraftSnapshot,
  startCircuitDraft
} from "../services/circuit/circuitDraft.js";
import {
  addToCircuitQueue,
  getCircuitQueue,
  removeFromCircuitQueue,
  reorderCircuitQueue
} from "../services/circuit/circuitQueue.js";
import { parseBody, parseParams } from "../utils/validate.js";

// One Circuit competition in a league: its setup, members and initialisation,
// then the draft queue, rosters and transactions. Setup responses are the league's full detail
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

  // Starts the league's one draft; the response is the draft and its seats.
  router.post("/:id/draft", async (req: AuthedRequest, res, next) => {
    try {
      const { id } = parseParams(idParam, req.params);
      return res.status(201).json(await startCircuitDraft(pool, id, viewerOf(req)));
    } catch (err) {
      next(err);
    }
  });

  // The snapshot of the league's draft (as GET /circuit-drafts/:id/snapshot);
  // 404 until the draft has started.
  router.get("/:id/draft", async (req: AuthedRequest, res, next) => {
    try {
      const { id } = parseParams(idParam, req.params);
      return res
        .status(200)
        .json(await getCircuitLeagueDraftSnapshot(pool, id, viewerOf(req)));
    } catch (err) {
      next(err);
    }
  });

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

  // The viewer's own draft queue, editable before and during the draft. Each
  // write returns the whole queue, top first.
  router.get("/:id/queue", async (req: AuthedRequest, res, next) => {
    try {
      const { id } = parseParams(idParam, req.params);
      return res.status(200).json(await getCircuitQueue(pool, id, viewerOf(req)));
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/queue", async (req: AuthedRequest, res, next) => {
    try {
      const { id } = parseParams(idParam, req.params);
      const { selection_id } = parseBody(circuitQueueAddBody, req.body);
      const { added, items } = await addToCircuitQueue(
        pool,
        id,
        viewerOf(req),
        selection_id
      );
      return res.status(added ? 201 : 200).json({ items });
    } catch (err) {
      next(err);
    }
  });

  router.put("/:id/queue", async (req: AuthedRequest, res, next) => {
    try {
      const { id } = parseParams(idParam, req.params);
      const { selection_ids } = parseBody(circuitQueueOrderBody, req.body);
      return res
        .status(200)
        .json(await reorderCircuitQueue(pool, id, viewerOf(req), selection_ids));
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id/queue/:selectionId", async (req: AuthedRequest, res, next) => {
    try {
      const { id, selectionId } = parseParams(circuitQueueItemParams, req.params);
      return res
        .status(200)
        .json(await removeFromCircuitQueue(pool, id, viewerOf(req), selectionId));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
