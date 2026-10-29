import type express from "express";
import { AppError, validationError } from "../../errors.js";
import { idParam, userIdBodySchema } from "@fantasy-oscars/shared/schemas";
import { parseBody, parseParams } from "../../utils/validate.js";
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
        const opts = {
          message: "Please check your entries and try again",
          fields: ["id", "user_id"]
        };
        const { id: seasonId } = parseParams(idParam, req.params, opts);
        const { user_id: targetUserId } = parseBody(userIdBodySchema, req.body, opts);
        const actorId = Number(req.auth?.sub);
        if (!actorId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

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
        if (
          !actorMember ||
          (actorMember.role !== "OWNER" && actorMember.role !== "CO_OWNER")
        ) {
          throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
        }

        const ok = await transferSeasonOwnership(client, seasonId, targetUserId);
        if (!ok) {
          throw validationError("User is not a season participant", ["user_id"]);
        }

        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );
}
