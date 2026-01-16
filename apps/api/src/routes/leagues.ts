import express from "express";
import { validationError, AppError } from "../errors.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import {
  createLeague,
  createLeagueMember,
  getLeagueById,
  listLeaguesForUser,
  listLeagueRoster,
  getLeagueMember,
  deleteLeagueMember,
  updateLeagueMemberRole,
  countCommissioners
} from "../data/repositories/leagueRepository.js";
import {
  listSeasonsForLeague,
  createExtantSeason
} from "../data/repositories/seasonRepository.js";
import { getActiveCeremonyId } from "../data/repositories/appConfigRepository.js";
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

  router.get(
    "/:id/members",
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
      try {
        const leagueId = Number(req.params.id);
        const userId = Number(req.auth?.sub);
        if (Number.isNaN(leagueId) || !userId) {
          throw validationError("Invalid league id", ["id"]);
        }

        const league = await getLeagueById(client, leagueId);
        if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
        const actor = await getLeagueMember(client, leagueId, userId);
        if (!actor || (actor.role !== "OWNER" && actor.role !== "CO_OWNER")) {
          throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
        }

        const members = await listLeagueRoster(client, leagueId);
        return res.json({ members });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/:id/transfer",
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
      try {
        const leagueId = Number(req.params.id);
        const actorId = Number(req.auth?.sub);
        const targetUserId = Number(req.body?.user_id);
        if (
          Number.isNaN(leagueId) ||
          Number.isNaN(actorId) ||
          Number.isNaN(targetUserId)
        ) {
          throw validationError("Invalid payload", ["id", "user_id"]);
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const league = await getLeagueById(tx, leagueId);
          if (!league) return new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
          const actor = await getLeagueMember(tx, leagueId, actorId);
          if (!actor || actor.role !== "OWNER") {
            return new AppError("FORBIDDEN", 403, "Only owner can transfer ownership");
          }
          const target = await getLeagueMember(tx, leagueId, targetUserId);
          if (!target) {
            return new AppError("LEAGUE_MEMBER_NOT_FOUND", 404, "Target is not a member");
          }
          if (target.role === "OWNER") {
            return new AppError("ALREADY_OWNER", 409, "Target is already owner");
          }

          await updateLeagueMemberRole(tx, leagueId, targetUserId, "OWNER");
          await updateLeagueMemberRole(tx, leagueId, actorId, "CO_OWNER");
          return null;
        });

        if (result instanceof AppError) throw result;
        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    "/:id/members/:userId",
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
      try {
        const leagueId = Number(req.params.id);
        const targetUserId = Number(req.params.userId);
        const actorId = Number(req.auth?.sub);
        if (
          Number.isNaN(leagueId) ||
          Number.isNaN(targetUserId) ||
          Number.isNaN(actorId)
        ) {
          throw validationError("Invalid ids", ["id", "userId"]);
        }
        const result = await runInTransaction(client as Pool, async (tx) => {
          const league = await getLeagueById(tx, leagueId);
          if (!league) return new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
          const actor = await getLeagueMember(tx, leagueId, actorId);
          if (!actor || (actor.role !== "OWNER" && actor.role !== "CO_OWNER")) {
            return new AppError("FORBIDDEN", 403, "Commissioner permission required");
          }
          const target = await getLeagueMember(tx, leagueId, targetUserId);
          if (!target) {
            return new AppError("LEAGUE_MEMBER_NOT_FOUND", 404, "Member not found");
          }
          if (target.role === "OWNER") {
            return new AppError("FORBIDDEN", 403, "Cannot remove the owner");
          }
          const commissionerCount = await countCommissioners(tx, leagueId);
          if (target.role === "CO_OWNER" && commissionerCount <= 1) {
            return new AppError(
              "FORBIDDEN",
              403,
              "Cannot remove the last commissioner; transfer ownership first"
            );
          }
          await deleteLeagueMember(tx, leagueId, targetUserId);
          return null;
        });
        if (result instanceof AppError) throw result;
        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
