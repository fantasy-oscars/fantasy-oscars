import express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import { AppError, validationError } from "../../errors.js";
import { query, runInTransaction } from "../../data/db.js";
import type { DbClient } from "../../data/db.js";
import {
  createLeagueMember,
  getLeagueMember
} from "../../data/repositories/leagueRepository.js";
import { getDraftBySeasonId } from "../../data/repositories/draftRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { addSeasonMember } from "../../data/repositories/seasonMemberRepository.js";
import { updateUserInviteStatus } from "../../data/repositories/seasonInviteRepository.js";
import { sanitizeInvite } from "./helpers.js";
import type { AuthedRequest } from "../../auth/middleware.js";

export function registerSeasonInvitesAcceptRoute(args: {
  router: Router;
  client: DbClient;
  inviteClaimLimiter: { middleware: express.RequestHandler };
}): void {
  const { router, client, inviteClaimLimiter } = args;

  router.post(
    "/invites/:inviteId/accept",
    inviteClaimLimiter.middleware,
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const inviteId = Number(req.params.inviteId);
        const userId = Number(req.auth?.sub);
        if (Number.isNaN(inviteId) || !userId) {
          throw validationError("Invalid invite id", ["inviteId"]);
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows } = await query<{
            id: number;
            season_id: number;
            league_id: number;
            ceremony_id: number;
            status: string;
            kind: string;
            intended_user_id: number | null;
          }>(
            tx,
            `SELECT si.id::int,
                    si.season_id::int,
                    s.league_id::int,
                    s.ceremony_id::int,
                    si.status,
                    si.kind,
                    si.intended_user_id::int
             FROM season_invite si
             JOIN season s ON s.id = si.season_id
             WHERE si.id = $1
             FOR UPDATE`,
            [inviteId]
          );
          const inviteRow = rows[0];
          const intendedUserId =
            inviteRow && inviteRow.intended_user_id !== null
              ? Number(inviteRow.intended_user_id)
              : null;
          if (
            !inviteRow ||
            inviteRow.kind !== "USER_TARGETED" ||
            intendedUserId !== userId ||
            inviteRow.status !== "PENDING"
          ) {
            return { error: new AppError("INVITE_NOT_FOUND", 404, "Invite not found") };
          }

          const season = await getSeasonById(tx, inviteRow.season_id);
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

          let leagueMember = await getLeagueMember(tx, season.league_id, userId);
          if (!leagueMember) {
            leagueMember = await createLeagueMember(tx, {
              league_id: season.league_id,
              user_id: userId,
              role: "MEMBER"
            });
          }

          const member = await addSeasonMember(tx, {
            season_id: season.id,
            user_id: userId,
            league_member_id: leagueMember.id,
            role: "MEMBER"
          });

          const updated = await updateUserInviteStatus(
            tx,
            inviteId,
            userId,
            "CLAIMED",
            new Date()
          );
          return { invite: updated, member };
        });

        if ("error" in result && result.error) {
          throw result.error;
        }
        if (!result.invite) {
          throw new AppError("INVITE_NOT_FOUND", 404, "Invite not found");
        }

        return res.status(200).json({ invite: sanitizeInvite(result.invite) });
      } catch (err) {
        next(err);
      }
    }
  );
}
