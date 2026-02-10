import type express from "express";
import { AppError, validationError } from "../../errors.js";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { getDraftBySeasonId } from "../../data/repositories/draftRepository.js";
import {
  getSeasonMember,
  transferSeasonOwnership
} from "../../data/repositories/seasonMemberRepository.js";

export function registerSeasonMembersTransferOwnershipRoute(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;

  router.post(
    "/:id/transfer-ownership",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        const actorId = Number(req.auth?.sub);
        const targetUserId = Number(req.body?.user_id);
        if (Number.isNaN(seasonId) || !actorId || Number.isNaN(targetUserId)) {
          throw validationError("Invalid ids", ["id", "user_id"]);
        }

        const season = await getSeasonById(client, seasonId);
        if (!season || season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }
        const draft = await getDraftBySeasonId(client, seasonId);
        const draftsStarted = Boolean(draft && draft.status !== "PENDING");
        if (draftsStarted) {
          throw new AppError("OWNERSHIP_LOCKED", 409, "Season ownership is locked");
        }

        const actorMember = await getSeasonMember(client, seasonId, actorId);
        if (!actorMember || (actorMember.role !== "OWNER" && actorMember.role !== "CO_OWNER")) {
          throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
        }

        const ok = await transferSeasonOwnership(client, seasonId, targetUserId);
        if (!ok) {
          throw new AppError("VALIDATION_FAILED", 400, "User is not a season participant");
        }

        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );
}

