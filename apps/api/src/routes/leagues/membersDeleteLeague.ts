import type express from "express";
import { idParam } from "@fantasy-oscars/shared/schemas";
import type { Pool } from "pg";
import { AppError } from "../../errors.js";
import { parseParams } from "../../utils/validate.js";
import { requireAuth, type AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { runInTransaction } from "../../data/db.js";
import {
  deleteLeague,
  getLeagueById,
  getLeagueMember
} from "../../data/repositories/leagueRepository.js";

export function registerLeagueMembersDeleteLeagueRoute(args: {
  router: express.Router;
  client: DbClient;
  authSecret: string;
}): void {
  const { router, client, authSecret } = args;

  router.delete(
    "/:id",
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
      try {
        const { id: leagueId } = parseParams(idParam, req.params, {
          message: "Invalid ids"
        });
        const actorId = Number(req.auth?.sub);

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
}
