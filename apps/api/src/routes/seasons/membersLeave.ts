import type express from "express";
import { AppError } from "../../errors.js";
import { idParam } from "@fantasy-oscars/shared/schemas";
import { parseParams } from "../../utils/validate.js";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { getDraftBySeasonId } from "../../data/repositories/draftRepository.js";
import {
  getSeasonMember,
  removeSeasonMember
} from "../../data/repositories/seasonMemberRepository.js";

export function registerSeasonMembersLeaveRoute(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;

  router.post(
    "/:id/leave",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id: seasonId } = parseParams(idParam, req.params, {
          message: "That link doesn't look right"
        });
        const userId = Number(req.auth?.sub);
        if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const season = await getSeasonById(client, seasonId);
        if (!season || season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }
        const draft = await getDraftBySeasonId(client, seasonId);
        const draftsStarted = Boolean(draft && draft.status !== "PENDING");
        if (draftsStarted) {
          throw new AppError("MEMBERSHIP_LOCKED", 409, "Season membership is locked");
        }

        const member = await getSeasonMember(client, seasonId, userId);
        if (!member)
          throw new AppError("SEASON_MEMBER_NOT_FOUND", 404, "Season member not found");
        if (member.role === "OWNER") {
          throw new AppError(
            "FORBIDDEN",
            403,
            "Owner cannot leave; transfer ownership or cancel season"
          );
        }

        await removeSeasonMember(client, seasonId, userId);

        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );
}
