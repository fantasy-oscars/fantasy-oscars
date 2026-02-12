import crypto from "crypto";
import type express from "express";
import type { Pool } from "pg";
import { AppError } from "../../errors.js";
import type { AuthedRequest } from "../../auth/middleware.js";
import { getActiveCeremonyId } from "../../data/repositories/appConfigRepository.js";
import {
  createLeagueMember,
  createPublicSeasonContainer,
  getPublicSeasonForCeremony,
  type PublicSeasonRecord
} from "../../data/repositories/leagueRepository.js";
import { createSeason } from "../../data/repositories/seasonRepository.js";
import type { DbClient } from "../../data/db.js";
import { runInTransaction } from "../../data/db.js";

export function registerSeasonPublicListRoute(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;

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
