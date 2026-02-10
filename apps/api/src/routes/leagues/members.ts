import type express from "express";
import type { Pool } from "pg";
import { AppError, validationError } from "../../errors.js";
import { requireAuth, type AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { runInTransaction } from "../../data/db.js";
import {
  countCommissioners,
  deleteLeague,
  deleteLeagueMember,
  getLeagueById,
  getLeagueMember,
  listLeagueRoster,
  updateLeagueMemberRole
} from "../../data/repositories/leagueRepository.js";

export function registerLeagueMemberRoutes(args: {
  router: express.Router;
  client: DbClient;
  authSecret: string;
}) {
  const { router, client, authSecret } = args;

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
    "/:id",
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
      try {
        const leagueId = Number(req.params.id);
        const actorId = Number(req.auth?.sub);
        if (Number.isNaN(leagueId) || Number.isNaN(actorId)) {
          throw validationError("Invalid ids", ["id"]);
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const league = await getLeagueById(tx, leagueId);
          if (!league) return new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
          const actor = await getLeagueMember(tx, leagueId, actorId);
          if (!actor || actor.role !== "OWNER") {
            return new AppError("FORBIDDEN", 403, "Only owner can delete league");
          }
          await deleteLeague(tx, leagueId);
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
}

