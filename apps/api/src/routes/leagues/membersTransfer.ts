import type express from "express";
import type { Pool } from "pg";
import { AppError, validationError } from "../../errors.js";
import { requireAuth, type AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { runInTransaction } from "../../data/db.js";
import {
  getLeagueById,
  getLeagueMember,
  updateLeagueMemberRole
} from "../../data/repositories/leagueRepository.js";

export function registerLeagueMembersTransferRoute(args: {
  router: express.Router;
  client: DbClient;
  authSecret: string;
}): void {
  const { router, client, authSecret } = args;

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
}
