import express from "express";
import type { Router } from "express";
import crypto from "crypto";
import { AppError, validationError } from "../errors.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { getActiveCeremonyId } from "../data/repositories/appConfigRepository.js";
import {
  getLeagueById,
  getLeagueMember,
  createLeagueMember,
  getPublicSeasonForCeremony,
  createPublicSeasonContainer,
  type PublicSeasonRecord
} from "../data/repositories/leagueRepository.js";
import {
  createSeason,
  getExtantSeasonForLeague,
  getMostRecentSeason,
  listSeasonsForLeague,
  cancelSeason,
  getSeasonById,
  updateSeasonScoringStrategy,
  updateSeasonCategoryWeights,
  updateSeasonRemainderStrategy
} from "../data/repositories/seasonRepository.js";
import { runInTransaction, query } from "../data/db.js";
import type { DbClient } from "../data/db.js";
import type { Pool } from "pg";
import {
  createDraftEvent,
  getDraftBySeasonId
} from "../data/repositories/draftRepository.js";
import { emitDraftEvent } from "../realtime/draftEvents.js";
import {
  addSeasonMember,
  countSeasonMembers,
  getSeasonMember,
  listSeasonMembers,
  removeSeasonMember,
  transferSeasonOwnership
} from "../data/repositories/seasonMemberRepository.js";
import {
  createPlaceholderInvite,
  findPendingPlaceholderInviteByTokenHash,
  getPlaceholderInviteById,
  listPlaceholderInvites,
  revokePendingPlaceholderInvite,
  updatePlaceholderInviteLabel,
  createUserTargetedInvite,
  listPendingUserInvitesForUser,
  updateUserInviteStatus,
  type SeasonInviteRecord
} from "../data/repositories/seasonInviteRepository.js";
import { createRateLimitGuard } from "../utils/rateLimitMiddleware.js";

// Search helpers: case-insensitive + accent-insensitive matching (best-effort).
// This must not change rendering, only which results match user queries.
const SEARCH_TRANSLATE_FROM = "áàâäãåæçéèêëíìîïñóòôöõøœßúùûüýÿ";
const SEARCH_TRANSLATE_TO = "aaaaaaaceeeeiiiinooooooosuuuuyy";
function escapeLike(input: string) {
  return input.replace(/%/g, "\\%").replace(/_/g, "\\_");
}
function normalizeForSearch(input: string) {
  return String(input ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
function sqlNorm(exprSql: string) {
  return `translate(lower(${exprSql}), '${SEARCH_TRANSLATE_FROM}', '${SEARCH_TRANSLATE_TO}')`;
}

export function createSeasonsRouter(client: DbClient, authSecret: string): Router {
  const router = express.Router();

  router.use(requireAuth(authSecret));

  const inviteClaimLimiter = createRateLimitGuard({
    windowMs: 60_000,
    max: 10,
    key: (req) => req.ip ?? "unknown"
  });

  const publicSeasonJoinLimiter = createRateLimitGuard({
    windowMs: 5 * 60_000,
    max: 8,
    key: (req) => req.ip ?? "unknown"
  });

  router.get(
    "/public",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
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

        const ensurePublicSeason = async (): Promise<PublicSeasonRecord> => {
          const defaults = getPublicSeasonDefaults();
          const existing = await getPublicSeasonForCeremony(client, activeCeremonyId);
          if (existing) return existing;
          return runInTransaction(client as Pool, async (tx) => {
            const stillExisting = await getPublicSeasonForCeremony(tx, activeCeremonyId);
            if (stillExisting) return stillExisting;
            const code = `pubs-${activeCeremonyId}-${crypto.randomBytes(3).toString("hex")}`;
            const name = `Public Season ${activeCeremonyId}`;
            const rosterSize = Math.min(defaults.rosterSize, defaults.maxMembers);
            const league = await createPublicSeasonContainer(tx, {
              ceremony_id: activeCeremonyId,
              name,
              code,
              max_members: defaults.maxMembers,
              roster_size: rosterSize,
              created_by_user_id: userId
            });
            const season = await createSeason(tx, {
              league_id: league.id,
              ceremony_id: activeCeremonyId
            });
            await createLeagueMember(tx, {
              league_id: league.id,
              user_id: userId,
              role: "OWNER"
            });
            if (league.ceremony_id == null) {
              throw new AppError(
                "INTERNAL_ERROR",
                500,
                "Public season container league is missing ceremony id"
              );
            }
            return {
              league_id: league.id,
              season_id: season.id,
              code: league.code,
              name: league.name,
              ceremony_id: league.ceremony_id,
              max_members: league.max_members,
              roster_size: league.roster_size,
              member_count: 0
            };
          });
        };

        const season = await ensurePublicSeason();
        return res.json({ seasons: [season] });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/public/:id/join",
    publicSeasonJoinLimiter.middleware,
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        const userId = Number(req.auth?.sub);
        if (Number.isNaN(seasonId) || !userId) {
          throw validationError("Invalid season id", ["id"]);
        }
        const activeCeremonyId = await getActiveCeremonyId(client);
        if (!activeCeremonyId) {
          throw new AppError(
            "ACTIVE_CEREMONY_NOT_SET",
            409,
            "Active ceremony is not configured"
          );
        }
        const result = await runInTransaction(client as Pool, async (tx) => {
          const season = await getSeasonById(tx, seasonId);
          if (!season || season.status !== "EXTANT") {
            return new AppError("SEASON_NOT_FOUND", 404, "Season not found");
          }
          const league = await getLeagueById(tx, season.league_id);
          if (!league || !league.is_public_season) {
            return new AppError("SEASON_NOT_FOUND", 404, "Season not found");
          }
          if (
            league.ceremony_id == null ||
            Number(league.ceremony_id) !== Number(activeCeremonyId)
          ) {
            return new AppError(
              "WRONG_CEREMONY",
              409,
              "Season is not for the active ceremony"
            );
          }
          const memberCount = await countSeasonMembers(tx, seasonId);
          if (memberCount >= league.max_members) {
            return new AppError("PUBLIC_SEASON_FULL", 409, "Public season is full");
          }
          const existingSeasonMember = await getSeasonMember(tx, seasonId, userId);
          if (existingSeasonMember) {
            return { league, season, existing: true };
          }
          let leagueMember = await getLeagueMember(tx, league.id, userId);
          if (!leagueMember) {
            leagueMember = await createLeagueMember(tx, {
              league_id: league.id,
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
          return { league, season, existing: false };
        });
        if (result instanceof AppError) throw result;
        return res.status(200).json({
          league: result.league,
          season: result.season,
          already_joined: result.existing
        });
      } catch (err) {
        next(err);
      }
    }
  );

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

        const ceremonyIdRaw = req.body?.ceremony_id;
        const ceremonyId =
          ceremonyIdRaw === undefined || ceremonyIdRaw === null
            ? null
            : Number(ceremonyIdRaw);

        // Back-compat: if no ceremony_id provided, fall back to the legacy single-active ceremony.
        const fallbackActiveCeremonyId = ceremonyId
          ? null
          : await getActiveCeremonyId(client);
        const chosenCeremonyId = ceremonyId ?? fallbackActiveCeremonyId;
        if (!chosenCeremonyId || Number.isNaN(Number(chosenCeremonyId))) {
          throw new AppError(
            "CEREMONY_REQUIRED",
            409,
            "Ceremony is required to create a season"
          );
        }

        const ceremonyIdNum = Number(chosenCeremonyId);
        const { rows: ceremonyRows } = await query<{ status: string }>(
          client,
          `SELECT status FROM ceremony WHERE id = $1`,
          [ceremonyIdNum]
        );
        const ceremonyStatus = ceremonyRows[0]?.status;
        if (!ceremonyStatus) {
          throw new AppError("CEREMONY_NOT_FOUND", 404, "Ceremony not found");
        }
        if (ceremonyStatus === "LOCKED") {
          throw new AppError("CEREMONY_LOCKED", 409, "Ceremony is locked");
        }
        if (ceremonyStatus !== "PUBLISHED") {
          throw new AppError("CEREMONY_NOT_PUBLISHED", 409, "Ceremony is not published");
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
          if (existing && existing.ceremony_id === ceremonyIdNum) {
            throw new AppError(
              "SEASON_EXISTS",
              409,
              "An active season already exists for this ceremony"
            );
          }

          const prior = await getMostRecentSeason(tx, leagueId);
          const season = await createSeason(tx, {
            league_id: leagueId,
            ceremony_id: ceremonyIdNum,
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

  async function ensureSeasonMember(
    db: DbClient,
    seasonId: number,
    leagueId: number,
    userId: number
  ) {
    const existing = await getSeasonMember(db, seasonId, userId);
    if (existing) return existing;

    const leagueMember = await getLeagueMember(db, leagueId, userId);
    if (!leagueMember) {
      // Keep 404 to avoid leaking season existence to non-members.
      throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
    }

    const inserted = await addSeasonMember(db, {
      season_id: seasonId,
      user_id: userId,
      league_member_id: leagueMember.id,
      role: leagueMember.role
    });
    if (inserted) return inserted;

    // Race / conflict: refetch.
    const refetched = await getSeasonMember(db, seasonId, userId);
    if (!refetched) {
      throw new AppError("INTERNAL_ERROR", 500, "Failed to join season");
    }
    return refetched;
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

  async function getUserByUsername(client: DbClient, username: string) {
    const u = String(username ?? "")
      .trim()
      .toLowerCase();
    if (!u) return null;
    const { rows } = await query<{ id: number; username: string }>(
      client,
      `SELECT id::int, username FROM app_user WHERE lower(username) = $1`,
      [u]
    );
    return rows[0] ?? null;
  }

  const handleCancelSeason = async (
    req: AuthedRequest,
    res: express.Response,
    next: express.NextFunction
  ) => {
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
  };
  router.post("/seasons/:id/cancel", handleCancelSeason);
  router.post("/:id/cancel", handleCancelSeason);

  const handleUpdateScoring = async (
    req: AuthedRequest,
    res: express.Response,
    next: express.NextFunction
  ) => {
    try {
      const seasonId = Number(req.params.id);
      const { scoring_strategy_name, category_weights } = req.body ?? {};
      const actorId = Number(req.auth?.sub);
      if (Number.isNaN(seasonId) || !actorId) {
        throw validationError("Invalid season id", ["id"]);
      }
      if (!["fixed", "negative", "category_weighted"].includes(scoring_strategy_name)) {
        throw validationError("Invalid scoring_strategy_name", ["scoring_strategy_name"]);
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

        let weightsToWrite: Record<string, number> | null = null;
        if (category_weights !== undefined) {
          if (category_weights === null || typeof category_weights !== "object") {
            throw validationError("Invalid category_weights", ["category_weights"]);
          }
          const next: Record<string, number> = {};
          for (const [k, v] of Object.entries(
            category_weights as Record<string, unknown>
          )) {
            const id = Number(k);
            const n = Number(v);
            if (!Number.isFinite(id) || id <= 0) {
              throw validationError("Invalid category_weights key", ["category_weights"]);
            }
            if (!Number.isInteger(n) || n < -99 || n > 99) {
              throw validationError(
                "Category weight must be an integer between -99 and 99",
                ["category_weights"]
              );
            }
            next[String(id)] = n;
          }
          weightsToWrite = next;
        }

        // If switching into weighted scoring without an explicit weights payload, seed a safe default (1).
        if (scoring_strategy_name === "category_weighted" && weightsToWrite === null) {
          const { rows } = await query<{ id: number }>(
            tx,
            `SELECT id::int FROM category_edition WHERE ceremony_id = $1 ORDER BY sort_index ASC, id ASC`,
            [season.ceremony_id]
          );
          const seeded: Record<string, number> = {};
          for (const r of rows) seeded[String(r.id)] = 1;
          weightsToWrite = seeded;
        }

        const updatedSeason =
          (await updateSeasonScoringStrategy(
            tx,
            season.id,
            scoring_strategy_name as "fixed" | "negative" | "category_weighted"
          )) ?? season;

        const updated =
          weightsToWrite !== null
            ? ((await updateSeasonCategoryWeights(tx, season.id, weightsToWrite)) ??
              updatedSeason)
            : updatedSeason;

        return { season: updated };
      });

      return res.status(200).json({ season: result.season });
    } catch (err) {
      next(err);
    }
  };
  router.post("/seasons/:id/scoring", handleUpdateScoring);
  router.post("/:id/scoring", handleUpdateScoring);

  const handleUpdateAllocation = async (
    req: AuthedRequest,
    res: express.Response,
    next: express.NextFunction
  ) => {
    try {
      const seasonId = Number(req.params.id);
      const { remainder_strategy } = req.body ?? {};
      const actorId = Number(req.auth?.sub);
      if (Number.isNaN(seasonId) || !actorId) {
        throw validationError("Invalid season id", ["id"]);
      }
      if (!["UNDRAFTED", "FULL_POOL"].includes(remainder_strategy)) {
        throw validationError("Invalid remainder_strategy", ["remainder_strategy"]);
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
            "ALLOCATION_LOCKED",
            409,
            "Cannot change allocation after draft has started"
          );
        }

        const updated =
          (await updateSeasonRemainderStrategy(
            tx,
            season.id,
            remainder_strategy as "UNDRAFTED" | "FULL_POOL"
          )) ?? season;

        return { season: updated };
      });

      return res.status(200).json({ season: result.season });
    } catch (err) {
      next(err);
    }
  };
  router.post("/seasons/:id/allocation", handleUpdateAllocation);
  router.post("/:id/allocation", handleUpdateAllocation);

  const handleUpdateTimer = async (
    req: AuthedRequest,
    res: express.Response,
    next: express.NextFunction
  ) => {
    try {
      const seasonId = Number(req.params.id);
      const actorId = Number(req.auth?.sub);
      const timerRaw = (req.body ?? {}).pick_timer_seconds;
      const pickTimerSeconds =
        timerRaw === undefined || timerRaw === null ? null : Number(timerRaw);
      if (Number.isNaN(seasonId) || !actorId) {
        throw validationError("Invalid season id", ["id"]);
      }
      if (
        pickTimerSeconds !== null &&
        (!Number.isFinite(pickTimerSeconds) || pickTimerSeconds < 0)
      ) {
        throw validationError("Invalid pick_timer_seconds", ["pick_timer_seconds"]);
      }

      const result = await runInTransaction(client as Pool, async (tx) => {
        const season = await getSeasonById(tx, seasonId);
        if (!season) throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        const league = await getLeagueById(tx, season.league_id);
        if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
        const member = await getLeagueMember(tx, league.id, actorId);
        ensureCommissioner(member);

        const draft = await getDraftBySeasonId(tx, season.id);
        if (!draft) {
          throw new AppError("DRAFT_NOT_FOUND", 409, "Draft not created yet");
        }
        if (draft.status !== "PENDING") {
          throw new AppError(
            "TIMER_LOCKED",
            409,
            "Cannot change timer after draft has started"
          );
        }

        const nextSeconds =
          pickTimerSeconds && pickTimerSeconds > 0 ? Math.floor(pickTimerSeconds) : null;

        const { rows } = await query<{
          id: number;
          pick_timer_seconds: number | null;
          auto_pick_strategy: string | null;
        }>(
          tx,
          `
            UPDATE draft
            SET pick_timer_seconds = $2,
                auto_pick_strategy = $3,
                auto_pick_seed = NULL,
                auto_pick_config = NULL,
                pick_deadline_at = NULL,
                pick_timer_remaining_ms = NULL
            WHERE id = $1
            RETURNING
              id::int,
              pick_timer_seconds::int,
              auto_pick_strategy
          `,
          [draft.id, nextSeconds, nextSeconds ? "RANDOM_SEED" : null]
        );
        const updated = rows[0];
        if (!updated) {
          throw new AppError("INTERNAL_ERROR", 500, "Failed to update timer");
        }
        return { draft: updated };
      });

      return res.status(200).json({ draft: result.draft });
    } catch (err) {
      next(err);
    }
  };
  router.post("/seasons/:id/timer", handleUpdateTimer);
  router.post("/:id/timer", handleUpdateTimer);

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

        const actorSeasonMember = await getSeasonMember(client, seasonId, actorId);
        const actorLeagueMember = actorSeasonMember
          ? null
          : await getLeagueMember(client, season.league_id, actorId);
        ensureCommissioner(actorSeasonMember ?? actorLeagueMember);

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

        const includeCancelled =
          req.query.include_cancelled === "true" &&
          (req.auth as { is_admin?: boolean })?.is_admin === true;
        const seasons = await listSeasonsForLeague(client, leagueId, {
          includeCancelled
        });
        const response = seasons.map((s) => ({
          id: s.id,
          ceremony_id: s.ceremony_id,
          ceremony_name: s.ceremony_name ?? null,
          status: s.status,
          scoring_strategy_name: s.scoring_strategy_name,
          remainder_strategy: s.remainder_strategy,
          pick_timer_seconds: s.pick_timer_seconds ?? null,
          auto_pick_strategy: s.auto_pick_strategy ?? null,
          created_at: s.created_at,
          ceremony_starts_at: s.ceremony_starts_at ?? null,
          draft_id: s.draft_id ?? null,
          draft_status: s.draft_status ?? null,
          is_active_ceremony: s.ceremony_status
            ? ["PUBLISHED", "LOCKED", "COMPLETE"].includes(
                String(s.ceremony_status).toUpperCase()
              )
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

        // Early-MVP ergonomics: if the season_member row wasn't seeded, auto-join league members.
        await ensureSeasonMember(client, seasonId, season.league_id, userId);

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
        const { user_id, username } = req.body ?? {};
        const userId = user_id === undefined || user_id === null ? NaN : Number(user_id);
        const usernameStr = typeof username === "string" ? username : null;
        const actorId = Number(req.auth?.sub);
        if (Number.isNaN(seasonId)) {
          throw validationError("Invalid payload", ["id"]);
        }
        if (!actorId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const season = await getSeasonById(client, seasonId);
        if (!season || season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }

        const draft = await getDraftBySeasonId(client, seasonId);
        const draftsStarted = Boolean(draft && draft.status !== "PENDING");
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

        let resolvedUserId: number | null = Number.isFinite(userId) ? userId : null;
        if (!resolvedUserId && usernameStr) {
          const user = await getUserByUsername(client, usernameStr);
          if (!user) throw new AppError("USER_NOT_FOUND", 404, "User not found");
          resolvedUserId = Number(user.id);
        }
        if (!resolvedUserId) {
          throw validationError("Missing required fields", ["user_id", "username"]);
        }

        // Season membership implies league membership (not the other way around).
        // If the target user isn't yet a league member, create that membership automatically.
        let leagueMember = await getLeagueMember(
          client,
          season.league_id,
          resolvedUserId
        );
        if (!leagueMember) {
          leagueMember = await createLeagueMember(client, {
            league_id: season.league_id,
            user_id: resolvedUserId,
            role: "MEMBER"
          });
        }

        const added = await addSeasonMember(client, {
          season_id: seasonId,
          user_id: resolvedUserId,
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
        const draft = await getDraftBySeasonId(client, seasonId);
        const draftsStarted = Boolean(draft && draft.status !== "PENDING");
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

        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

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
        if (
          !actorMember ||
          (actorMember.role !== "OWNER" && actorMember.role !== "CO_OWNER")
        ) {
          throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
        }

        const ok = await transferSeasonOwnership(client, seasonId, targetUserId);
        if (!ok) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "User is not a season participant"
          );
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

  router.post(
    "/:id/user-invites",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        const actorId = Number(req.auth?.sub);
        const { user_id, username } = req.body ?? {};
        const targetUserId =
          user_id === undefined || user_id === null ? NaN : Number(user_id);
        const usernameStr = typeof username === "string" ? username : null;
        if (Number.isNaN(seasonId) || !actorId) {
          throw validationError("Invalid payload", ["id"]);
        }

        let resolvedUserId: number | null = Number.isFinite(targetUserId)
          ? targetUserId
          : null;
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
          throw new AppError(
            "USER_ALREADY_MEMBER",
            409,
            "That user is already in this season."
          );
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
        if (!result.invite)
          throw new AppError("INVITE_NOT_FOUND", 404, "Invite not found");

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
            return {
              error: new AppError("SEASON_NOT_FOUND", 404, "Season not found")
            };
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

function getPublicSeasonDefaults() {
  return {
    maxMembers: parseIntEnv(process.env.PUBLIC_SEASON_MAX_MEMBERS, 200),
    rosterSize: parseIntEnv(process.env.PUBLIC_SEASON_ROSTER_SIZE, 10)
  };
}

function parseIntEnv(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}
