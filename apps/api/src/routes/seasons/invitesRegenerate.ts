import express from "express";
import type { Router } from "express";
import crypto from "crypto";
import type { Pool } from "pg";
import { AppError, validationError } from "../../errors.js";
import { runInTransaction } from "../../data/db.js";
import type { DbClient } from "../../data/db.js";
import { getDraftBySeasonId } from "../../data/repositories/draftRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { getSeasonMember } from "../../data/repositories/seasonMemberRepository.js";
import {
  createPlaceholderInvite,
  getPlaceholderInviteById,
  revokePendingPlaceholderInvite,
  type SeasonInviteRecord
} from "../../data/repositories/seasonInviteRepository.js";
import { ensureCommissioner, sanitizeInvite } from "./helpers.js";
import type { AuthedRequest } from "../../auth/middleware.js";

export function registerSeasonInvitesRegenerateRoute(args: {
  router: Router;
  client: DbClient;
}): void {
  const { router, client } = args;

  router.post(
    "/:id/invites/:inviteId/regenerate",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        const inviteId = Number(req.params.inviteId);
        const actorId = Number(req.auth?.sub);
        if (Number.isNaN(seasonId) || Number.isNaN(inviteId) || !actorId) {
          throw validationError("Invalid ids", ["id", "inviteId"]);
        }

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

        const invite = await getPlaceholderInviteById(client, seasonId, inviteId);
        if (!invite) {
          throw new AppError("INVITE_NOT_FOUND", 404, "Invite not found");
        }
        if (invite.status !== "PENDING") {
          throw new AppError(
            "INVITE_NOT_PENDING",
            409,
            "Only pending invites can be regenerated"
          );
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const revoked = await revokePendingPlaceholderInvite(tx, seasonId, inviteId);
          if (!revoked) return null;

          let nextInvite: SeasonInviteRecord | null = null;
          let tokenValue = "";
          for (let attempt = 0; attempt < 5; attempt++) {
            const candidateToken = crypto.randomBytes(24).toString("base64url");
            const tokenHash = crypto
              .createHash("sha256")
              .update(candidateToken)
              .digest("hex");
            try {
              const created = await createPlaceholderInvite(tx, {
                season_id: seasonId,
                token_hash: tokenHash,
                label: invite.label,
                created_by_user_id: actorId
              });
              nextInvite = created;
              tokenValue = candidateToken;
              break;
            } catch (err) {
              const pgErr = err as { code?: string };
              if (pgErr.code === "23505") continue;
              throw err;
            }
          }

          if (!nextInvite) {
            throw new AppError(
              "INTERNAL_ERROR",
              500,
              "Failed to generate a unique invite token"
            );
          }
          return { revoked, nextInvite, tokenValue };
        });

        if (!result) {
          throw new AppError(
            "INVITE_NOT_FOUND",
            404,
            "Pending placeholder invite not found"
          );
        }

        return res
          .status(200)
          .json({ invite: sanitizeInvite(result.nextInvite), token: result.tokenValue });
      } catch (err) {
        next(err);
      }
    }
  );
}
