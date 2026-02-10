import crypto from "crypto";
import type express from "express";
import type { Pool } from "pg";
import { AppError, validationError } from "../../errors.js";
import type { AuthedRequest } from "../../auth/middleware.js";
import { getActiveCeremonyId } from "../../data/repositories/appConfigRepository.js";
import {
  createLeagueMember,
  createPublicSeasonContainer,
  getLeagueById,
  getLeagueMember,
  getPublicSeasonForCeremony,
  type PublicSeasonRecord
} from "../../data/repositories/leagueRepository.js";
import { createSeason, getSeasonById } from "../../data/repositories/seasonRepository.js";
import type { DbClient } from "../../data/db.js";
import { runInTransaction } from "../../data/db.js";
import {
  addSeasonMember,
  countSeasonMembers,
  getSeasonMember
} from "../../data/repositories/seasonMemberRepository.js";

export function registerSeasonPublicRoutes(args: {
  router: express.Router;
  client: DbClient;
  publicSeasonJoinLimiter: { middleware: express.RequestHandler };
}) {
  const { router, client, publicSeasonJoinLimiter } = args;

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
            const code = `pubs-${activeCeremonyId}-${crypto
              .randomBytes(3)
              .toString("hex")}`;
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
