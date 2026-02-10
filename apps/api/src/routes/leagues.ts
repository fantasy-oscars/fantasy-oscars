import express from "express";
import type { Router } from "express";
import { randomBytes } from "crypto";
import { validationError, AppError } from "../errors.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import {
  createLeague,
  createLeagueMember,
  getLeagueById,
  listLeaguesForUser,
  listLeagueRoster,
  getLeagueMember
} from "../data/repositories/leagueRepository.js";
import {
  listSeasonsForLeague,
  createExtantSeason
} from "../data/repositories/seasonRepository.js";
import type { DbClient } from "../data/db.js";
import { query, runInTransaction } from "../data/db.js";
import type { Pool } from "pg";
import {
  addSeasonMember
} from "../data/repositories/seasonMemberRepository.js";
import { createDraft, getDraftBySeasonId } from "../data/repositories/draftRepository.js";
import { SlidingWindowRateLimiter } from "../utils/rateLimiter.js";
import { registerLeaguePublicRoutes } from "./leagues/public.js";
import { registerLeagueJoinRoutes } from "./leagues/join.js";
import { registerLeagueMemberRoutes } from "./leagues/members.js";

const joinRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 8
});

const DEFAULT_LEAGUE_MAX_MEMBERS = 10;

function slugifyLeagueCodeBase(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return base.length > 0 ? base.slice(0, 24) : "league";
}

function generateLeagueCode(name: string): string {
  const base = slugifyLeagueCodeBase(name);
  const suffix = randomBytes(3).toString("hex"); // 6 chars
  return `${base}-${suffix}`;
}

function isPgErrorWithCode(err: unknown): err is { code: string } {
  if (typeof err !== "object" || err === null) return false;
  if (!("code" in err)) return false;
  const maybe = err as { code?: unknown };
  return typeof maybe.code === "string";
}

export function createLeaguesRouter(client: DbClient, authSecret: string): Router {
  const router = express.Router();

  // League membership is invite-only for MVP; open joins are disabled.
  registerLeaguePublicRoutes({ router, client, authSecret });
  registerLeagueJoinRoutes({ router, client, authSecret, joinRateLimiter });
  registerLeagueMemberRoutes({ router, client, authSecret });

  router.post("/", requireAuth(authSecret), async (req: AuthedRequest, res, next) => {
    try {
      const { name } = req.body ?? {};
      const creator = req.auth;
      if (!creator?.sub) {
        throw new AppError("UNAUTHORIZED", 401, "Missing auth token");
      }

      if (!name) {
        throw validationError("Missing required fields", ["name"]);
      }

      const nameStr = String(name).trim();
      if (nameStr.length === 0) {
        throw validationError("Invalid name", ["name"]);
      }

      const maxMembersNum = DEFAULT_LEAGUE_MAX_MEMBERS;

      // Generate a shareable code server-side; retry if a collision occurs.
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const result = await runInTransaction(client as Pool, async (tx) => {
            const league = await createLeague(tx, {
              code: generateLeagueCode(nameStr),
              name: nameStr,
              ceremony_id: null,
              max_members: maxMembersNum,
              roster_size: maxMembersNum, // placeholder until draft sizing is derived at start
              is_public: false,
              created_by_user_id: Number(creator.sub)
            });

            const ownerMembership = await createLeagueMember(tx, {
              league_id: league.id,
              user_id: Number(creator.sub),
              role: "OWNER"
            });
            void ownerMembership;

            return { league, season: null };
          });

          return res
            .status(201)
            .json({ league: result.league, season: result.season ?? null });
        } catch (err: unknown) {
          lastErr = err;
          // Postgres unique_violation (e.g. league_code_key) => retry.
          if (isPgErrorWithCode(err) && err.code === "23505") continue;
          throw err;
        }
      }

      throw lastErr ?? new AppError("INTERNAL_ERROR", 500, "Failed to create league");
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", requireAuth(authSecret), async (req: AuthedRequest, res, next) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        throw validationError("Invalid league id", ["id"]);
      }
      const league = await getLeagueById(client, id);
      if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
      return res.json({ league });
    } catch (err) {
      next(err);
    }
  });

  router.get("/", requireAuth(authSecret), async (req: AuthedRequest, res, next) => {
    try {
      const userId = Number(req.auth?.sub);
      if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");
      const leagues = await listLeaguesForUser(client, userId);
      return res.json({ leagues });
    } catch (err) {
      next(err);
    }
  });

  router.get(
    "/:id/seasons",
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
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
          ceremony_code: s.ceremony_code ?? null,
          status: s.status,
          scoring_strategy_name: s.scoring_strategy_name,
          category_weights:
            (s as { category_weights?: unknown }).category_weights ?? null,
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

        return res.status(200).json({ seasons: response });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/:id/seasons",
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
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

        const scoringRaw = req.body?.scoring_strategy_name;
        const scoringStrategy =
          scoringRaw === undefined || scoringRaw === null ? "fixed" : String(scoringRaw);
        if (!["fixed", "negative", "category_weighted"].includes(scoringStrategy)) {
          throw validationError("Invalid scoring_strategy_name", [
            "scoring_strategy_name"
          ]);
        }

        const remainderRaw = req.body?.remainder_strategy;
        const remainderStrategy =
          remainderRaw === undefined || remainderRaw === null
            ? "UNDRAFTED"
            : String(remainderRaw);
        if (!["UNDRAFTED", "FULL_POOL"].includes(remainderStrategy)) {
          throw validationError("Invalid remainder_strategy", ["remainder_strategy"]);
        }

        const timerRaw = req.body?.pick_timer_seconds;
        const pickTimerSeconds =
          timerRaw === undefined || timerRaw === null ? null : Number(timerRaw);
        if (
          pickTimerSeconds !== null &&
          (!Number.isFinite(pickTimerSeconds) || pickTimerSeconds < 0)
        ) {
          throw validationError("Invalid pick_timer_seconds", ["pick_timer_seconds"]);
        }

        // Multi-ceremony: season creation must explicitly choose a ceremony.
        if (!ceremonyId || Number.isNaN(Number(ceremonyId))) {
          throw new AppError(
            "CEREMONY_REQUIRED",
            409,
            "Ceremony is required to create a season"
          );
        }

        const ceremonyIdNum = Number(ceremonyId);
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

          // Strongly enforce: one extant season per ceremony per league.
          const { rows: existingRows } = await query<{ id: number }>(
            tx,
            `SELECT id::int FROM season WHERE league_id = $1 AND ceremony_id = $2 AND status = 'EXTANT' LIMIT 1`,
            [leagueId, ceremonyIdNum]
          );
          if (existingRows[0]?.id) {
            throw new AppError(
              "SEASON_EXISTS",
              409,
              "An active season already exists for this ceremony"
            );
          }

          const season = await createExtantSeason(tx, {
            league_id: leagueId,
            ceremony_id: ceremonyIdNum
          });

          // Apply creation-time defaults (editable later).
          await query(
            tx,
            `UPDATE season SET scoring_strategy_name = $2, remainder_strategy = $3 WHERE id = $1`,
            [season.id, scoringStrategy, remainderStrategy]
          );
          season.scoring_strategy_name = scoringStrategy as
            | "fixed"
            | "negative"
            | "category_weighted";
          season.remainder_strategy = remainderStrategy as "UNDRAFTED" | "FULL_POOL";

          // Seed season membership from current league roster so the season is immediately usable.
          // This mirrors user expectations: seasons are inside a league, so league members participate by default.
          const roster = await listLeagueRoster(tx, leagueId);
          for (const r of roster) {
            await addSeasonMember(tx, {
              season_id: season.id,
              user_id: r.user_id,
              league_member_id: r.id,
              role: r.role as "OWNER" | "CO_OWNER" | "MEMBER"
            });
          }

          const existingDraft = await getDraftBySeasonId(tx, season.id);
          if (existingDraft) {
            // Shouldn't happen for a new season, but keep it safe.
            return { season, draft: existingDraft };
          }

          const draft = await createDraft(tx, {
            league_id: leagueId,
            season_id: season.id,
            status: "PENDING",
            draft_order_type: "SNAKE",
            current_pick_number: null,
            started_at: null,
            completed_at: null,
            remainder_strategy: remainderStrategy as "UNDRAFTED" | "FULL_POOL",
            pick_timer_seconds:
              pickTimerSeconds && pickTimerSeconds > 0
                ? Math.floor(pickTimerSeconds)
                : null,
            auto_pick_strategy:
              pickTimerSeconds && pickTimerSeconds > 0 ? "RANDOM_SEED" : null
          });

          return { season, draft };
        });

        return res.status(201).json({ season: result.season, draft: result.draft });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
