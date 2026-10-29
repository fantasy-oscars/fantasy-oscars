import type express from "express";
import { idParam, userIdBodySchema } from "@fantasy-oscars/shared/schemas";
import type { Pool } from "pg";
import { AppError } from "../../errors.js";
import { parseBody, parseParams } from "../../utils/validate.js";
import { requireAuth, type AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { runInTransaction } from "../../data/db.js";
import {
  getLeagueById,
  getLeagueMember,
  transferLeagueOwnership
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
        const opts = { message: "Invalid payload", fields: ["id", "user_id"] };
        const { id: leagueId } = parseParams(idParam, req.params, opts);
        const { user_id: targetUserId } = parseBody(userIdBodySchema, req.body, opts);
        const actorId = Number(req.auth?.sub);

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

          const ok = await transferLeagueOwnership(tx, leagueId, targetUserId);
          if (!ok) {
            return new AppError("LEAGUE_MEMBER_NOT_FOUND", 404, "Target is not a member");
          }
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
