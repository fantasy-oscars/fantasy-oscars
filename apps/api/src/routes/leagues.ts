import express from "express";
import { validationError, AppError } from "../errors.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import {
  createLeague,
  createLeagueMember,
  getLeagueById,
  listLeaguesForUser,
  listPublicLeagues,
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
import {
  listSeasonMembers,
  addSeasonMember
} from "../data/repositories/seasonMemberRepository.js";
import { SlidingWindowRateLimiter } from "../utils/rateLimiter.js";

const joinRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 8
});

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

        const ownerMembership = await createLeagueMember(tx, {
          league_id: league.id,
          user_id: Number(creator.sub),
          role: "OWNER"
        });
        void ownerMembership;

        return { league, season };
      });

      return res.status(201).json({ league: result.league, season: result.season });
    } catch (err) {
      next(err);
    }
  });

  router.get(
    "/public",
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
      try {
        const search = typeof req.query.q === "string" ? req.query.q.trim() : undefined;
        const leagues = await listPublicLeagues(client, { search });
        return res.json({ leagues });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/public/:id",
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
      try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) {
          throw validationError("Invalid league id", ["id"]);
        }
        const league = await getLeagueById(client, id);
        if (!league || !league.is_public) {
          throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
        }
        const seasons = await listSeasonsForLeague(client, id, {
          includeCancelled: false
        });
        if (seasons.length === 0) {
          throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
        }
        const activeSeason = seasons[0];
        const members = await listSeasonMembers(client, activeSeason.id);
        return res.json({
          league,
          season: activeSeason,
          member_count: members.length
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/:id/join",
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
      try {
        if (!joinRateLimiter.allow(req.ip ?? "unknown")) {
          throw new AppError("RATE_LIMITED", 429, "Too many join attempts");
        }
        const leagueId = Number(req.params.id);
        const userId = Number(req.auth?.sub);
        if (Number.isNaN(leagueId) || Number.isNaN(userId)) {
          throw validationError("Invalid league id", ["id"]);
        }
        const result = await runInTransaction(client as Pool, async (tx) => {
          const league = await getLeagueById(tx, leagueId);
          if (!league) return new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
          if (!league.is_public) {
            return new AppError(
              "INVITE_ONLY_MEMBERSHIP",
              410,
              "League membership is invite-only"
            );
          }
          const seasons = await listSeasonsForLeague(tx, leagueId, {
            includeCancelled: false
          });
          const season = seasons[0];
          if (!season) {
            return new AppError("SEASON_NOT_FOUND", 404, "No active season for league");
          }
          const { rows: lmRows } = await tx.query<{ count: string }>(
            `SELECT COUNT(*)::int AS count FROM league_member WHERE league_id = $1`,
            [leagueId]
          );
          const totalMembers = Number(lmRows[0]?.count ?? 0);
          if (totalMembers >= league.max_members) {
            return new AppError("LEAGUE_FULL", 409, "League is full");
          }

          let leagueMember = await getLeagueMember(tx, leagueId, userId);
          if (!leagueMember) {
            leagueMember = await createLeagueMember(tx, {
              league_id: leagueId,
              user_id: userId,
              role: "MEMBER"
            });
          }
          await addSeasonMember(tx, {
            season_id: season.id,
            user_id: userId,
            league_member_id: leagueMember.id,
            role: "MEMBER"
          });
          return { league, season };
        });
        if (result instanceof AppError) throw result;
        return res.status(200).json({ league: result.league, season: result.season });
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
