import express from "express";
import type { Router } from "express";
import crypto from "crypto";
import { AppError } from "../../errors.js";
import { idParam, seasonLabelBodySchema } from "@fantasy-oscars/shared/schemas";
import { parseBody, parseParams } from "../../utils/validate.js";
import type { DbClient } from "../../data/db.js";
import { getDraftBySeasonId } from "../../data/repositories/draftRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { getSeasonMember } from "../../data/repositories/seasonMemberRepository.js";
import {
  createPlaceholderInvite,
  type SeasonInviteRecord
} from "../../data/repositories/seasonInviteRepository.js";
import { ensureCommissioner, sanitizeInvite } from "./helpers.js";
import type { AuthedRequest } from "../../auth/middleware.js";

export function registerSeasonInvitesCreateRoute(args: {
  router: Router;
  client: DbClient;
}): void {
  const { router, client } = args;

  router.post(
    "/:id/invites",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id: seasonId } = parseParams(idParam, req.params, {
          message: "That link doesn't look right"
        });
        const actorId = Number(req.auth?.sub);
        if (!actorId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");
        const { label } = parseBody(seasonLabelBodySchema, req.body);

        const season = await getSeasonById(client, seasonId);
        if (!season || season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }

        const draft = await getDraftBySeasonId(client, seasonId);
        const draftsStarted = Boolean(draft && draft.status !== "PENDING");
        if (draftsStarted) {
          throw new AppError("INVITES_LOCKED", 409, "Season invites are locked");
        }

        const actorMember = await getSeasonMember(client, seasonId, actorId);
        ensureCommissioner(actorMember);

        let invite: SeasonInviteRecord | null = null;
        let token = "";
        for (let attempt = 0; attempt < 5; attempt++) {
          const candidateToken = crypto.randomBytes(24).toString("base64url");
          const tokenHash = crypto
            .createHash("sha256")
            .update(candidateToken)
            .digest("hex");
          try {
            invite = await createPlaceholderInvite(client, {
              season_id: seasonId,
              token_hash: tokenHash,
              label: label ?? null,
              created_by_user_id: actorId
            });
            token = candidateToken;
            break;
          } catch (err) {
            const pgErr = err as { code?: string };
            if (pgErr.code === "23505") {
              continue;
            }
            throw err;
          }
        }

        if (!invite) {
          throw new AppError(
            "INTERNAL_ERROR",
            500,
            "Failed to generate a unique invite token"
          );
        }

        return res.status(201).json({ invite: sanitizeInvite(invite), token });
      } catch (err) {
        next(err);
      }
    }
  );
}
