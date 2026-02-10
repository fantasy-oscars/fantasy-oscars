import type express from "express";
import type { Pool } from "pg";
import { randomBytes } from "crypto";
import { requireAuth, type AuthedRequest } from "../../auth/middleware.js";
import { AppError, validationError } from "../../errors.js";
import { runInTransaction } from "../../data/db.js";
import type { DbClient } from "../../data/db.js";
import {
  createLeague,
  createLeagueMember
} from "../../data/repositories/leagueRepository.js";

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

export function registerLeaguesCreateRoute(args: {
  router: express.Router;
  client: DbClient;
  authSecret: string;
}): void {
  const { router, client, authSecret } = args;

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

          return res.status(201).json({ league: result.league, season: result.season ?? null });
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
}

