import express from "express";
import type { NextFunction, Response, Router } from "express";
import type { Pool } from "pg";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { hasOperatorAccess } from "../auth/roles.js";
import { isMemberOfAnyLeague } from "../data/repositories/leagueRepository.js";
import { AppError } from "../errors.js";
import { upsertCircuitSelection } from "../services/circuit/circuitSelections.js";
import {
  getContenderFilmCredits,
  searchContenderFilms
} from "../services/contenderSearch.js";
import { createRateLimitGuard } from "../utils/rateLimitMiddleware.js";
import { parseBody, parseParams, parseQuery } from "../utils/validate.js";
import {
  contenderFilmParam,
  contenderSearchQuery,
  contenderSelectionBody
} from "@fantasy-oscars/shared/schemas";

// Sliding windows per signed-in user and per client IP. The IP window is wider
// so a few players behind one address are not throttled by each other.
export const CONTENDER_RATE_LIMITS = {
  windowMs: 60 * 1000,
  perUser: 30,
  perIp: 120
} as const;

function limitPair() {
  const { windowMs, perUser, perIp } = CONTENDER_RATE_LIMITS;
  const ip = createRateLimitGuard({ windowMs, max: perIp });
  const user = createRateLimitGuard({
    windowMs,
    max: perUser,
    key: (req) => `user:${String((req as AuthedRequest).auth?.sub ?? "")}`
  });
  return { ip: ip.middleware, user: user.middleware };
}

// Player TMDB search for picking contenders, and the selection upsert:
// signed-in users who belong to a league, or operators.
export function createContendersRouter(client: Pool, authSecret: string): Router {
  const router = express.Router();

  const requireContenderAccess = async (
    req: AuthedRequest,
    _res: Response,
    next: NextFunction
  ) => {
    try {
      if (hasOperatorAccess(req.auth)) return next();
      const userId = Number(req.auth?.sub);
      if (await isMemberOfAnyLeague(client, userId)) return next();
      return next(
        new AppError("FORBIDDEN", 403, "Join a league to search for contenders")
      );
    } catch (err) {
      next(err);
    }
  };

  const searchLimits = limitPair();
  router.get(
    "/films/search",
    searchLimits.ip,
    requireAuth(authSecret),
    searchLimits.user,
    requireContenderAccess,
    async (req: AuthedRequest, res, next) => {
      try {
        const { q } = parseQuery(contenderSearchQuery, req.query);
        return res.status(200).json({ results: await searchContenderFilms(q) });
      } catch (err) {
        next(err);
      }
    }
  );

  const creditsLimits = limitPair();
  router.get(
    "/films/:tmdbId/credits",
    creditsLimits.ip,
    requireAuth(authSecret),
    creditsLimits.user,
    requireContenderAccess,
    async (req: AuthedRequest, res, next) => {
      try {
        const { tmdbId } = parseParams(contenderFilmParam, req.params);
        return res.status(200).json(await getContenderFilmCredits(tmdbId));
      } catch (err) {
        next(err);
      }
    }
  );

  // Upsert only: a selection is never updated (ADR 0005, section 5). A new one
  // syncs the film from TMDB, so it shares the search limits.
  const selectionLimits = limitPair();
  router.post(
    "/selections",
    selectionLimits.ip,
    requireAuth(authSecret),
    selectionLimits.user,
    requireContenderAccess,
    async (req: AuthedRequest, res, next) => {
      try {
        const identity = parseBody(contenderSelectionBody, req.body);
        const { selection, created } = await upsertCircuitSelection(client, identity);
        return res.status(created ? 201 : 200).json({ selection });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
