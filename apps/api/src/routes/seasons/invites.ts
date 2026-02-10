import express from "express";
import type { Router } from "express";
import crypto from "crypto";
import type { Pool } from "pg";
import { AppError, validationError } from "../../errors.js";
import { type DbClient, query, runInTransaction } from "../../data/db.js";
import { escapeLike, normalizeForSearch, sqlNorm } from "../../domain/search.js";
import {
  createLeagueMember,
  getLeagueMember
} from "../../data/repositories/leagueRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { getDraftBySeasonId } from "../../data/repositories/draftRepository.js";
import {
  addSeasonMember,
  getSeasonMember
} from "../../data/repositories/seasonMemberRepository.js";
import {
  createPlaceholderInvite,
  createUserTargetedInvite,
  findPendingPlaceholderInviteByTokenHash,
  getPlaceholderInviteById,
  listPendingUserInvitesForUser,
  listPlaceholderInvites,
  revokePendingPlaceholderInvite,
  updatePlaceholderInviteLabel,
  updateUserInviteStatus,
  type SeasonInviteRecord
} from "../../data/repositories/seasonInviteRepository.js";
import {
  ensureCommissioner,
  getUserById,
  getUserByUsername,
  sanitizeInvite
} from "./helpers.js";
import type { AuthedRequest } from "../../auth/middleware.js";

export function registerSeasonInviteRoutes(args: {
  router: Router;
  client: DbClient;
  inviteClaimLimiter: { middleware: express.RequestHandler };
}): void {
  const { router, client, inviteClaimLimiter } = args;

  router.get(
    "/:id/invites",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        if (Number.isNaN(seasonId)) {
          throw validationError("Invalid season id", ["id"]);
        }
        const userId = Number(req.auth?.sub);
        if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const season = await getSeasonById(client, seasonId);
        if (!season || season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }

        const member = await getSeasonMember(client, seasonId, userId);
        const leagueMember = member ? null : await getLeagueMember(client, season.league_id, userId);
        ensureCommissioner(member ?? leagueMember);

        const invites = await listPlaceholderInvites(client, seasonId);
        return res.status(200).json({ invites: invites.map(sanitizeInvite) });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/:id/invites",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        const actorId = Number(req.auth?.sub);
        const { label } = req.body ?? {};
        if (Number.isNaN(seasonId) || !actorId) {
          throw validationError("Invalid season id", ["id"]);
        }
        if (label !== undefined && typeof label !== "string") {
          throw validationError("Invalid label", ["label"]);
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

  router.post(
    "/:id/invites/:inviteId/revoke",
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

        const revoked = await revokePendingPlaceholderInvite(client, seasonId, inviteId);
        if (!revoked) {
          throw new AppError("INVITE_NOT_FOUND", 404, "Pending placeholder invite not found");
        }

        return res.status(200).json({ invite: sanitizeInvite(revoked) });
      } catch (err) {
        next(err);
      }
    }
  );

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
          throw new AppError("INVITE_NOT_PENDING", 409, "Only pending invites can be regenerated");
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
          throw new AppError("INVITE_NOT_FOUND", 404, "Pending placeholder invite not found");
        }

        return res
          .status(200)
          .json({ invite: sanitizeInvite(result.nextInvite), token: result.tokenValue });
      } catch (err) {
        next(err);
      }
    }
  );

  router.patch(
    "/:id/invites/:inviteId",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        const inviteId = Number(req.params.inviteId);
        const actorId = Number(req.auth?.sub);
        const { label } = req.body ?? {};
        if (Number.isNaN(seasonId) || Number.isNaN(inviteId) || !actorId) {
          throw validationError("Invalid ids", ["id", "inviteId"]);
        }
        if (label !== undefined && typeof label !== "string") {
          throw validationError("Invalid label", ["label"]);
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

        const updated = await updatePlaceholderInviteLabel(client, seasonId, inviteId, label ?? null);
        if (!updated) {
          throw new AppError("INVITE_NOT_FOUND", 404, "Pending placeholder invite not found");
        }

        return res.status(200).json({ invite: sanitizeInvite(updated) });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/:id/user-invites",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        const actorId = Number(req.auth?.sub);
        const { user_id, username } = req.body ?? {};
        const targetUserId = user_id === undefined || user_id === null ? NaN : Number(user_id);
        const usernameStr = typeof username === "string" ? username : null;
        if (Number.isNaN(seasonId) || !actorId) {
          throw validationError("Invalid payload", ["id"]);
        }

        let resolvedUserId: number | null = Number.isFinite(targetUserId) ? targetUserId : null;
        if (!resolvedUserId && usernameStr) {
          const u = await getUserByUsername(client, usernameStr);
          if (!u) throw new AppError("USER_NOT_FOUND", 404, "User not found");
          resolvedUserId = Number(u.id);
        }
        if (!resolvedUserId) {
          throw validationError("Missing required fields", ["user_id", "username"]);
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

        const actorSeasonMember = await getSeasonMember(client, seasonId, actorId);
        const actorLeagueMember = actorSeasonMember
          ? null
          : await getLeagueMember(client, season.league_id, actorId);
        ensureCommissioner(actorSeasonMember ?? actorLeagueMember);

        const targetUser = await getUserById(client, resolvedUserId);
        if (!targetUser) {
          throw new AppError("USER_NOT_FOUND", 404, "User not found");
        }

        const existingMember = await getSeasonMember(client, seasonId, resolvedUserId);
        if (existingMember) {
          throw new AppError("USER_ALREADY_MEMBER", 409, "That user is already in this season.");
        }

        const { invite, created } = await createUserTargetedInvite(client, {
          season_id: seasonId,
          intended_user_id: resolvedUserId,
          created_by_user_id: actorId
        });

        return res.status(created ? 201 : 200).json({ invite: sanitizeInvite(invite) });
      } catch (err) {
        next(err);
      }
    }
  );

  // Commissioner helper: search users to invite to a season.
  // Used by the season "Manage invites" UI combobox.
  router.get(
    "/:id/invitees",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        const actorId = Number(req.auth?.sub);
        const qRaw = typeof req.query.q === "string" ? req.query.q.trim() : "";
        const q = normalizeForSearch(qRaw);
        if (Number.isNaN(seasonId) || !actorId) {
          throw validationError("Invalid season id", ["id"]);
        }
        if (!q) return res.status(200).json({ users: [] });

        const season = await getSeasonById(client, seasonId);
        if (!season || season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }

        const draft = await getDraftBySeasonId(client, seasonId);
        const draftsStarted = Boolean(draft && draft.status !== "PENDING");
        if (draftsStarted) {
          throw new AppError("INVITES_LOCKED", 409, "Season invites are locked");
        }

        const actorSeasonMember = await getSeasonMember(client, seasonId, actorId);
        const actorLeagueMember = actorSeasonMember
          ? null
          : await getLeagueMember(client, season.league_id, actorId);
        ensureCommissioner(actorSeasonMember ?? actorLeagueMember);

        const likeRaw = `%${escapeLike(qRaw)}%`;
        const likeNorm = `%${escapeLike(q)}%`;
        const { rows } = await query<{
          id: number;
          username: string;
        }>(
          client,
          `
            SELECT u.id::int, u.username
            FROM app_user u
            WHERE (
                u.username ILIKE $1 ESCAPE '\\'
                OR ${sqlNorm("u.username")} LIKE $2 ESCAPE '\\'
              )
              AND NOT EXISTS (
                SELECT 1
                FROM season_member sm
                WHERE sm.season_id = $3
                  AND sm.user_id = u.id
              )
            ORDER BY u.created_at DESC
            LIMIT 25
          `,
          [likeRaw, likeNorm, seasonId]
        );

        return res.status(200).json({ users: rows });
      } catch (err) {
        next(err);
      }
    }
  );

  // Placeholder invite claim via token (used by InviteClaimPage).
  router.post(
    "/invites/token/:token/accept",
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

          // Lock invite row to prevent double-claims.
          await query(tx, `SELECT id FROM season_invite WHERE id = $1 FOR UPDATE`, [invite.id]);

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

          // Ensure league membership exists, then add season member.
          let leagueMember = await getLeagueMember(tx, season.league_id, userId);
          if (!leagueMember) {
            leagueMember = await createLeagueMember(tx, {
              league_id: season.league_id,
              user_id: userId,
              role: "MEMBER"
            });
          }
          await addSeasonMember(tx, {
            season_id: season.id,
            user_id: userId,
            league_member_id: leagueMember.id,
            role: "MEMBER"
          });

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
             SET status = 'CLAIMED',
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
        if (!result.invite) throw new AppError("INVITE_NOT_FOUND", 404, "Invite not found");

        return res.status(200).json({ invite: sanitizeInvite(result.invite) });
      } catch (err) {
        next(err);
      }
    }
  );

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
        // Decline is intentionally non-destructive for placeholder invites.
        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/invites/inbox",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const userId = Number(req.auth?.sub);
        if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const invites = await listPendingUserInvitesForUser(client, userId);
        const seasonIds = invites.map((i) => i.season_id);
        const metaRows: Array<{
          season_id: number;
          league_id: number;
          league_name: string;
          ceremony_id: number;
        }> =
          seasonIds.length === 0
            ? []
            : (
                await query<{
                  season_id: number;
                  league_id: number;
                  league_name: string;
                  ceremony_id: number;
                }>(
                  client,
                  `SELECT s.id AS season_id,
                          s.league_id,
                          l.name AS league_name,
                          s.ceremony_id
                   FROM season s
                   JOIN league l ON l.id = s.league_id
                   WHERE s.id = ANY($1::bigint[])`,
                  [seasonIds]
                )
              ).rows;
        const metaMap = new Map(metaRows.map((m) => [Number(m.season_id), m]));
        const response = invites.map((invite) => {
          const m = metaMap.get(invite.season_id);
          return {
            ...sanitizeInvite(invite),
            league_id: m?.league_id ? Number(m.league_id) : null,
            league_name: m?.league_name ?? null,
            ceremony_id: m?.ceremony_id ? Number(m.ceremony_id) : null
          };
        });

        return res.json({ invites: response });
      } catch (err) {
        next(err);
      }
    }
  );

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

          const updated = await updateUserInviteStatus(tx, inviteId, userId, "CLAIMED", new Date());
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

  router.post(
    "/invites/:inviteId/decline",
    inviteClaimLimiter.middleware,
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const inviteId = Number(req.params.inviteId);
        const userId = Number(req.auth?.sub);
        if (Number.isNaN(inviteId) || !userId) {
          throw validationError("Invalid invite id", ["inviteId"]);
        }

        const updated = await updateUserInviteStatus(client, inviteId, userId, "DECLINED", new Date());
        if (!updated) {
          throw new AppError("INVITE_NOT_FOUND", 404, "Invite not found");
        }

        return res.status(200).json({ invite: sanitizeInvite(updated) });
      } catch (err) {
        next(err);
      }
    }
  );
}

