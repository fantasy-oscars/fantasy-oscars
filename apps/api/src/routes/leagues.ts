import express from "express";
import { validationError, AppError } from "../errors.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import {
  createLeague,
  createLeagueMember,
  getLeagueById,
  listLeaguesForUser
} from "../data/repositories/leagueRepository.js";
import { listSeasonsForLeague } from "../data/repositories/seasonRepository.js";
import { getActiveCeremonyId } from "../data/repositories/appConfigRepository.js";
import { createExtantSeason } from "../data/repositories/seasonRepository.js";
import type { DbClient } from "../data/db.js";
import { runInTransaction } from "../data/db.js";
import type { Pool } from "pg";

export function createLeaguesRouter(client: DbClient, authSecret: string) {
  const router = express.Router();

  // League membership is invite-only for MVP; open joins are disabled.
  router.post("/", requireAuth(authSecret), async (req: AuthedRequest, res, next) => {
    try {
      const { code, name, max_members, is_public } = req.body ?? {};
      const creator = req.auth;
      if (!creator?.sub) {
        throw new AppError("UNAUTHORIZED", 401, "Missing auth token");
      }

      if (!code || !name || !max_members) {
        throw validationError("Missing required fields", ["code", "name", "max_members"]);
      }

      const maxMembersNum = Number(max_members);
      if (!Number.isFinite(maxMembersNum) || maxMembersNum < 1) {
        throw validationError("Invalid max_members", ["max_members"]);
      }

      const activeCeremonyId = await getActiveCeremonyId(client);
      if (!activeCeremonyId) {
        throw new AppError(
          "ACTIVE_CEREMONY_NOT_SET",
          409,
          "Active ceremony is not configured"
        );
      }

      const result = await runInTransaction(client as Pool, async (tx) => {
        const league = await createLeague(tx, {
          code: String(code),
          name: String(name),
          ceremony_id: Number(activeCeremonyId),
          max_members: maxMembersNum,
          roster_size: maxMembersNum, // placeholder until draft sizing is derived at start
          is_public: Boolean(is_public),
          created_by_user_id: Number(creator.sub)
        });

        const season = await createExtantSeason(tx, {
          league_id: league.id,
          ceremony_id: league.ceremony_id
        });

        await createLeagueMember(tx, {
          league_id: league.id,
          user_id: Number(creator.sub),
          role: "OWNER"
        });

        return { league, season };
      });

      return res.status(201).json({ league: result.league, season: result.season });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/:id/join",
    requireAuth(authSecret),
    async (_req: AuthedRequest, res, next) => {
      try {
        throw new AppError(
          "INVITE_ONLY_MEMBERSHIP",
          410,
          "League membership is invite-only for MVP seasons"
        );
      } catch (err) {
        next(err);
      }
    }
  );

  router.get("/:id", requireAuth(authSecret), async (req: AuthedRequest, res, next) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        throw validationError("Invalid league id", ["id"]);
      }
      const league = await getLeagueById(client, id);
      if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
      // Hide leagues with no extant seasons.
      const seasons = await listSeasonsForLeague(client, id, { includeCancelled: false });
      if (seasons.length === 0) {
        throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
      }
      return res.json({ league });
    } catch (err) {
      next(err);
    }
  });

  router.get("/", requireAuth(authSecret), async (req: AuthedRequest, res, next) => {
    try {
      const userId = Number(req.auth?.sub);
      if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");
      const leagues = await listLeaguesForUser(client, userId);
      return res.json({ leagues });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
