import express from "express";
import type { Router } from "express";
import crypto from "crypto";
import type { Pool } from "pg";
import { AppError } from "../../errors.js";
import { query, runInTransaction } from "../../data/db.js";
import type { DbClient } from "../../data/db.js";
import { getDraftBySeasonId } from "../../data/repositories/draftRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { findPendingPlaceholderInviteByTokenHash } from "../../data/repositories/seasonInviteRepository.js";
import { sanitizeInvite } from "./helpers.js";
import type { AuthedRequest } from "../../auth/middleware.js";

export function registerSeasonInvitesTokenDeclineRoute(args: {
  router: Router;
  client: DbClient;
  inviteClaimLimiter: { middleware: express.RequestHandler };
}): void {
  const { router, client, inviteClaimLimiter } = args;

  router.post(
    "/invites/token/:token/decline",
    inviteClaimLimiter.middleware,
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const token = String(req.params.token ?? "").trim();
        const userId = Number(req.auth?.sub);
        if (!token || !userId) {
          throw new AppError("UNAUTHORIZED", 401, "Missing auth token");
        }
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

        const result = await runInTransaction(client as Pool, async (tx) => {
          const invite = await findPendingPlaceholderInviteByTokenHash(tx, tokenHash);
          if (!invite)
            return { error: new AppError("INVITE_NOT_FOUND", 404, "Invite not found") };

          await query(tx, `SELECT id FROM season_invite WHERE id = $1 FOR UPDATE`, [
            invite.id
          ]);

          const season = await getSeasonById(tx, invite.season_id);
          if (!season || season.status !== "EXTANT") {
            return { error: new AppError("SEASON_NOT_FOUND", 404, "Season not found") };
          }

          const draft = await getDraftBySeasonId(tx, season.id);
          const draftsStarted = Boolean(draft && draft.status !== "PENDING");
          if (draftsStarted) {
            return {
              error: new AppError("INVITES_LOCKED", 409, "Season invites are locked")
            };
          }

          const { rows } = await query<{
            id: number;
            season_id: number;
            kind: string;
            status: string;
            label: string | null;
            created_at: Date;
            updated_at: Date;
            claimed_at: Date | null;
          }>(
            tx,
            `UPDATE season_invite
             SET status = 'DECLINED',
                 claimed_by_user_id = $2,
                 claimed_at = NOW()
             WHERE id = $1 AND kind = 'PLACEHOLDER' AND status = 'PENDING'
             RETURNING
               id::int,
               season_id::int,
               kind,
               status,
               label,
               created_at,
               updated_at,
               claimed_at`,
            [invite.id, userId]
          );
          const updated = rows[0];
          if (!updated)
            return { error: new AppError("INVITE_NOT_FOUND", 404, "Invite not found") };
          return { invite: updated };
        });

        if ("error" in result && result.error) throw result.error;
        if (!result.invite)
          throw new AppError("INVITE_NOT_FOUND", 404, "Invite not found");

        return res.status(200).json({ invite: sanitizeInvite(result.invite) });
      } catch (err) {
        next(err);
      }
    }
  );
}
