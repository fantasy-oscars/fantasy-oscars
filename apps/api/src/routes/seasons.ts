import express from "express";
import crypto from "crypto";
import { AppError, validationError } from "../errors.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { getActiveCeremonyId } from "../data/repositories/appConfigRepository.js";
import {
  getLeagueById,
  getLeagueMember,
  createLeagueMember,
  deleteLeagueMember
} from "../data/repositories/leagueRepository.js";
import {
  createSeason,
  getExtantSeasonForLeague,
  getMostRecentSeason,
  listSeasonsForLeague,
  cancelSeason,
  getSeasonById,
  updateSeasonScoringStrategy
} from "../data/repositories/seasonRepository.js";
import { runInTransaction, query } from "../data/db.js";
import type { DbClient } from "../data/db.js";
import type { Pool } from "pg";
import {
  createDraftEvent,
  getDraftBySeasonId,
  hasDraftsStartedForCeremony
} from "../data/repositories/draftRepository.js";
import { emitDraftEvent } from "../realtime/draftEvents.js";
import {
  addSeasonMember,
  countSeasonMembers,
  getSeasonMember,
  listSeasonMembers,
  removeSeasonMember
} from "../data/repositories/seasonMemberRepository.js";
import {
  createPlaceholderInvite,
  getPlaceholderInviteById,
  listPlaceholderInvites,
  revokePendingPlaceholderInvite,
  updatePlaceholderInviteLabel,
  createUserTargetedInvite,
  listPendingUserInvitesForUser,
  updateUserInviteStatus,
  type SeasonInviteRecord
} from "../data/repositories/seasonInviteRepository.js";

export function createSeasonsRouter(client: DbClient, authSecret: string) {
  const router = express.Router();

  router.use(requireAuth(authSecret));

  router.post(
    "/leagues/:id/seasons",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const leagueId = Number(req.params.id);
        if (Number.isNaN(leagueId)) {
          throw validationError("Invalid league id", ["id"]);
        }
        const userId = Number(req.auth?.sub);
        if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const activeCeremonyId = await getActiveCeremonyId(client);
        if (!activeCeremonyId) {
          throw new AppError(
            "ACTIVE_CEREMONY_NOT_SET",
            409,
            "Active ceremony is not configured"
          );
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const league = await getLeagueById(tx, leagueId);
          if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");

          const member = await getLeagueMember(tx, leagueId, userId);
          const isCommissioner =
            league.created_by_user_id === userId ||
            (member && (member.role === "OWNER" || member.role === "CO_OWNER"));
          if (!isCommissioner) {
            throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
          }

          const existing = await getExtantSeasonForLeague(tx, leagueId);
          if (existing && existing.ceremony_id === Number(activeCeremonyId)) {
            throw new AppError(
              "SEASON_EXISTS",
              409,
              "An active season already exists for this ceremony"
            );
          }

          const prior = await getMostRecentSeason(tx, leagueId);
          const season = await createSeason(tx, {
            league_id: leagueId,
            ceremony_id: Number(activeCeremonyId),
            status: "EXTANT"
          });

          // Participant seeding: league_member is season participation proxy; ensure at least commissioner present.
          if (!member) {
            // backfill commissioner membership if somehow missing
            // ownership is enforced in leagues routes; here keep non-fatal.
          }

          return { season, prior };
        });

        return res.status(201).json({ season: result.season });
      } catch (err) {
        next(err);
      }
    }
  );

  function ensureCommissioner(member: { role: string } | null) {
    if (!member || (member.role !== "OWNER" && member.role !== "CO_OWNER")) {
      throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
    }
  }

  function sanitizeInvite(invite: {
    id: number;
    season_id: number;
    status: string;
    label: string | null;
    created_at: Date;
    updated_at: Date;
    claimed_at: Date | null;
    kind: string;
  }) {
    return {
      id: invite.id,
      season_id: invite.season_id,
      kind: invite.kind,
      status: invite.status,
      label: invite.label,
      created_at: invite.created_at,
      updated_at: invite.updated_at,
      claimed_at: invite.claimed_at
    };
  }

  async function getUserById(client: DbClient, userId: number) {
    const { rows } = await query<{ id: number }>(
      client,
      `SELECT id::int FROM app_user WHERE id = $1`,
      [userId]
    );
    return rows[0] ?? null;
  }

  router.post(
    "/seasons/:id/cancel",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        if (Number.isNaN(seasonId)) {
          throw validationError("Invalid season id", ["id"]);
        }
        const userId = Number(req.auth?.sub);
        if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const result = await runInTransaction(client as Pool, async (tx) => {
          const season = await getSeasonById(tx, seasonId);
          if (!season || season.status === "CANCELLED") {
            throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
          }
          const league = await getLeagueById(tx, season.league_id);
          if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
          const member = await getLeagueMember(tx, league.id, userId);
          const isCommissioner =
            league.created_by_user_id === userId ||
            (member && (member.role === "OWNER" || member.role === "CO_OWNER"));
          if (!isCommissioner) {
            throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
          }

          const draft = await getDraftBySeasonId(tx, season.id);
          if (draft && draft.status === "COMPLETED") {
            throw new AppError(
              "SEASON_CANNOT_CANCEL_COMPLETED",
              409,
              "Cannot cancel a season with a completed draft"
            );
          }

          const cancelled = await cancelSeason(tx, season.id);
          if (!cancelled) {
            throw new AppError("INTERNAL_ERROR", 500, "Failed to cancel season");
          }

          let event = null;
          if (draft) {
            event = await createDraftEvent(tx, {
              draft_id: draft.id,
              event_type: "season.cancelled",
              payload: { season_id: cancelled.id, draft_id: draft.id }
            });
          }

          return { season: cancelled, draft, event };
        });

        if (result.event) {
          emitDraftEvent(result.event);
        }

        return res.status(200).json({ season: result.season });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/seasons/:id/scoring",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        const { scoring_strategy_name } = req.body ?? {};
        const actorId = Number(req.auth?.sub);
        if (Number.isNaN(seasonId) || !actorId) {
          throw validationError("Invalid season id", ["id"]);
        }
        if (!["fixed", "negative"].includes(scoring_strategy_name)) {
          throw validationError("Invalid scoring_strategy_name", [
            "scoring_strategy_name"
          ]);
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const season = await getSeasonById(tx, seasonId);
          if (!season) throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
          const league = await getLeagueById(tx, season.league_id);
          if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
          const member = await getLeagueMember(tx, league.id, actorId);
          ensureCommissioner(member);

          const draft = await getDraftBySeasonId(tx, season.id);
          if (draft && draft.status !== "PENDING") {
            throw new AppError(
              "SEASON_SCORING_LOCKED",
              409,
              "Cannot change scoring after draft has started"
            );
          }

          const updated =
            (await updateSeasonScoringStrategy(
              tx,
              season.id,
              scoring_strategy_name as "fixed" | "negative"
            )) ?? season;

          return { season: updated };
        });

        return res.status(200).json({ season: result.season });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/:id/invites",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        const actorId = Number(req.auth?.sub);
        if (Number.isNaN(seasonId) || !actorId) {
          throw validationError("Invalid season id", ["id"]);
        }

        const season = await getSeasonById(client, seasonId);
        if (!season || season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }

        const actorMember = await getSeasonMember(client, seasonId, actorId);
        ensureCommissioner(actorMember);

        const invites = await listPlaceholderInvites(client, seasonId);
        return res.json({ invites: invites.map(sanitizeInvite) });
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

        const draftsStarted = await hasDraftsStartedForCeremony(
          client,
          season.ceremony_id
        );
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

        const draftsStarted = await hasDraftsStartedForCeremony(
          client,
          season.ceremony_id
        );
        if (draftsStarted) {
          throw new AppError("INVITES_LOCKED", 409, "Season invites are locked");
        }

        const actorMember = await getSeasonMember(client, seasonId, actorId);
        ensureCommissioner(actorMember);

        const revoked = await revokePendingPlaceholderInvite(client, seasonId, inviteId);
        if (!revoked) {
          throw new AppError(
            "INVITE_NOT_FOUND",
            404,
            "Pending placeholder invite not found"
          );
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

        const draftsStarted = await hasDraftsStartedForCeremony(
          client,
          season.ceremony_id
        );
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

        const draftsStarted = await hasDraftsStartedForCeremony(
          client,
          season.ceremony_id
        );
        if (draftsStarted) {
          throw new AppError("INVITES_LOCKED", 409, "Season invites are locked");
        }

        const actorMember = await getSeasonMember(client, seasonId, actorId);
        ensureCommissioner(actorMember);

        const updated = await updatePlaceholderInviteLabel(
          client,
          seasonId,
          inviteId,
          label ?? null
        );
        if (!updated) {
          throw new AppError(
            "INVITE_NOT_FOUND",
            404,
            "Pending placeholder invite not found"
          );
        }

        return res.status(200).json({ invite: sanitizeInvite(updated) });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/leagues/:id/seasons",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const leagueId = Number(req.params.id);
        if (Number.isNaN(leagueId)) {
          throw validationError("Invalid league id", ["id"]);
        }
        const userId = Number(req.auth?.sub);
        if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const league = await getLeagueById(client, leagueId);
        if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");

        const member = await getLeagueMember(client, leagueId, userId);
        if (!member) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");

        const activeCeremonyId = await getActiveCeremonyId(client);
        const includeCancelled =
          req.query.include_cancelled === "true" &&
          (req.auth as { is_admin?: boolean })?.is_admin === true;
        const seasons = await listSeasonsForLeague(client, leagueId, {
          includeCancelled
        });
        const response = seasons.map((s) => ({
          id: s.id,
          ceremony_id: s.ceremony_id,
          status: s.status,
          scoring_strategy_name: s.scoring_strategy_name,
          created_at: s.created_at,
          is_active_ceremony: activeCeremonyId
            ? Number(activeCeremonyId) === Number(s.ceremony_id)
            : false
        }));
        return res.json({ seasons: response });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/:id/members",
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
        if (!member) throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");

        const members = await listSeasonMembers(client, seasonId);
        return res.json({ members });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/:id/members",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        const { user_id } = req.body ?? {};
        const userId = Number(user_id);
        const actorId = Number(req.auth?.sub);
        if (Number.isNaN(seasonId) || Number.isNaN(userId)) {
          throw validationError("Invalid payload", ["id", "user_id"]);
        }
        if (!actorId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const season = await getSeasonById(client, seasonId);
        if (!season || season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }

        const draftsStarted = await hasDraftsStartedForCeremony(
          client,
          season.ceremony_id
        );
        if (draftsStarted) {
          throw new AppError("MEMBERSHIP_LOCKED", 409, "Season membership is locked");
        }

        const league = await getLeagueById(client, season.league_id);
        if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");

        const actorMember = await getSeasonMember(client, seasonId, actorId);
        if (
          !actorMember ||
          (actorMember.role !== "OWNER" && actorMember.role !== "CO_OWNER")
        ) {
          throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
        }

        const currentCount = await countSeasonMembers(client, seasonId);
        if (currentCount >= 50) {
          throw new AppError("MEMBERSHIP_FULL", 409, "Season participant cap reached");
        }

        const leagueMember = await getLeagueMember(client, season.league_id, userId);
        if (!leagueMember) {
          throw new AppError(
            "LEAGUE_MEMBER_REQUIRED",
            400,
            "User must be a league member before joining season"
          );
        }

        const added = await addSeasonMember(client, {
          season_id: seasonId,
          user_id: userId,
          league_member_id: leagueMember.id,
          role: "MEMBER"
        });
        if (!added) {
          throw new AppError(
            "ALREADY_MEMBER",
            409,
            "User is already a season participant"
          );
        }

        return res.status(201).json({ member: added });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    "/:id/members/:userId",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        const targetUserId = Number(req.params.userId);
        const actorId = Number(req.auth?.sub);
        if (Number.isNaN(seasonId) || Number.isNaN(targetUserId)) {
          throw validationError("Invalid ids", ["id", "userId"]);
        }
        if (!actorId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const season = await getSeasonById(client, seasonId);
        if (!season || season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }
        const draftsStarted = await hasDraftsStartedForCeremony(
          client,
          season.ceremony_id
        );
        if (draftsStarted) {
          throw new AppError("MEMBERSHIP_LOCKED", 409, "Season membership is locked");
        }

        const actorMember = await getSeasonMember(client, seasonId, actorId);
        if (
          !actorMember ||
          (actorMember.role !== "OWNER" && actorMember.role !== "CO_OWNER")
        ) {
          throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
        }

        const targetMember = await getSeasonMember(client, seasonId, targetUserId);
        if (!targetMember) {
          throw new AppError("SEASON_MEMBER_NOT_FOUND", 404, "Season member not found");
        }
        if (targetMember.role === "OWNER") {
          throw new AppError(
            "FORBIDDEN",
            403,
            "Cannot remove the season owner; transfer ownership or cancel season"
          );
        }

        await removeSeasonMember(client, seasonId, targetUserId);

        // If user has no completed seasons in league and no other membership, remove league membership.
        const { rows: otherSeasonRows } = await query<{ count: string }>(
          client,
          `SELECT COUNT(*)::int AS count
           FROM season_member sm
           JOIN season s ON s.id = sm.season_id
           WHERE sm.user_id = $1 AND s.league_id = $2`,
          [targetUserId, season.league_id]
        );
        const otherCount = Number(otherSeasonRows[0]?.count ?? 0);
        if (otherCount === 0) {
          await deleteLeagueMember(client, season.league_id, targetUserId);
        }

        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/:id/leave",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        const userId = Number(req.auth?.sub);
        if (Number.isNaN(seasonId) || !userId) {
          throw validationError("Invalid season id", ["id"]);
        }

        const season = await getSeasonById(client, seasonId);
        if (!season || season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }
        const draftsStarted = await hasDraftsStartedForCeremony(
          client,
          season.ceremony_id
        );
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

        const { rows: otherSeasonRows } = await query<{ count: string }>(
          client,
          `SELECT COUNT(*)::int AS count
           FROM season_member sm
           JOIN season s ON s.id = sm.season_id
           WHERE sm.user_id = $1 AND s.league_id = $2`,
          [userId, season.league_id]
        );
        const otherCount = Number(otherSeasonRows[0]?.count ?? 0);
        if (otherCount === 0) {
          await deleteLeagueMember(client, season.league_id, userId);
        }

        return res.status(200).json({ ok: true });
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
        const { user_id } = req.body ?? {};
        const targetUserId = Number(user_id);
        if (Number.isNaN(seasonId) || Number.isNaN(targetUserId) || !actorId) {
          throw validationError("Invalid payload", ["id", "user_id"]);
        }

        const season = await getSeasonById(client, seasonId);
        if (!season || season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }

        const draftsStarted = await hasDraftsStartedForCeremony(
          client,
          season.ceremony_id
        );
        if (draftsStarted) {
          throw new AppError("INVITES_LOCKED", 409, "Season invites are locked");
        }

        const actorMember = await getSeasonMember(client, seasonId, actorId);
        ensureCommissioner(actorMember);

        const targetUser = await getUserById(client, targetUserId);
        if (!targetUser) {
          throw new AppError("USER_NOT_FOUND", 404, "User not found");
        }

        const { invite, created } = await createUserTargetedInvite(client, {
          season_id: seasonId,
          intended_user_id: targetUserId,
          created_by_user_id: actorId
        });

        return res.status(created ? 201 : 200).json({ invite: sanitizeInvite(invite) });
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
            return {
              error: new AppError("SEASON_NOT_FOUND", 404, "Season not found")
            };
          }

          const draftsStarted = await hasDraftsStartedForCeremony(tx, season.ceremony_id);
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

  router.post(
    "/invites/:inviteId/decline",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const inviteId = Number(req.params.inviteId);
        const userId = Number(req.auth?.sub);
        if (Number.isNaN(inviteId) || !userId) {
          throw validationError("Invalid invite id", ["inviteId"]);
        }

        const updated = await updateUserInviteStatus(
          client,
          inviteId,
          userId,
          "DECLINED",
          new Date()
        );
        if (!updated) {
          throw new AppError("INVITE_NOT_FOUND", 404, "Invite not found");
        }

        return res.status(200).json({ invite: sanitizeInvite(updated) });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
