import express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import { circuitDraftPickBody, idParam } from "@fantasy-oscars/shared/schemas";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { hasSuperAdminAccess } from "../auth/roles.js";
import { AppError } from "../errors.js";
import {
  getCircuitDraftSnapshot,
  pauseCircuitDraft,
  resumeCircuitDraft,
  submitCircuitDraftPick
} from "../services/circuit/circuitDraft.js";
import type { Viewer } from "../services/circuit/circuitLeagues.js";
import { SlidingWindowRateLimiter } from "../utils/rateLimiter.js";
import { parseBody, parseParams } from "../utils/validate.js";

// A running Circuit draft. The league's draft is started from
// POST /circuit-leagues/:id/draft; picks land here, at most three per member
// per draft in two seconds, as in the ceremony draft. The league owner
// pauses and resumes it here. The snapshot is the board for first load and
// reconnect; live changes arrive as `draft:event` on the /circuits namespace.
export function createCircuitDraftsRouter(pool: Pool, authSecret: string): Router {
  const router = express.Router();
  const pickRateLimiter = new SlidingWindowRateLimiter({ windowMs: 2000, max: 3 });
  router.use(requireAuth(authSecret));

  const viewerOf = (req: AuthedRequest): Viewer => ({
    userId: Number(req.auth?.sub),
    isSuperAdmin: hasSuperAdminAccess(req.auth)
  });

  router.get("/:id/snapshot", async (req: AuthedRequest, res, next) => {
    try {
      const { id } = parseParams(idParam, req.params);
      return res.status(200).json(await getCircuitDraftSnapshot(pool, id, viewerOf(req)));
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/picks", async (req: AuthedRequest, res, next) => {
    try {
      const { id } = parseParams(idParam, req.params);
      const body = parseBody(circuitDraftPickBody, req.body);
      const viewer = viewerOf(req);
      if (!pickRateLimiter.allow(`${id}:${viewer.userId}`)) {
        throw new AppError("RATE_LIMITED", 429, "Too many pick attempts; slow down.");
      }
      const result = await submitCircuitDraftPick(pool, id, viewer, {
        selectionId: body.selection_id,
        requestId: body.request_id
      });
      return res.status(result.reused ? 200 : 201).json({
        pick: result.pick,
        draft: result.draft
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/pause", async (req: AuthedRequest, res, next) => {
    try {
      const { id } = parseParams(idParam, req.params);
      return res.status(200).json(await pauseCircuitDraft(pool, id, viewerOf(req)));
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/resume", async (req: AuthedRequest, res, next) => {
    try {
      const { id } = parseParams(idParam, req.params);
      return res.status(200).json(await resumeCircuitDraft(pool, id, viewerOf(req)));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
