import type { QueryClient } from "@tanstack/react-query";
import type { LeagueMember, LeagueSummary, SeasonMeta } from "../../lib/types";
import {
  ceremoniesListQuery,
  leagueMembersQuery,
  leagueQuery,
  leagueSeasonsQuery,
  leaguesListQuery
} from "../query/queries";

export type LeagueContextForSeason = {
  league: LeagueSummary;
  season: SeasonMeta & { id: number };
  leagueMembers: LeagueMember[];
  ceremonyStatus: string | null;
};

/**
 * Finds the league (and league-level data) a season belongs to. Reads go
 * through the shared league/ceremony queries so they dedupe with, and reuse the
 * cache of, the league and index screens.
 */
export async function loadLeagueContextForSeason(
  queryClient: QueryClient,
  seasonId: number,
  opts?: { leagueIdHint?: number | null }
): Promise<LeagueContextForSeason | null> {
  const hintedLeagueId =
    Number.isFinite(opts?.leagueIdHint) && (opts?.leagueIdHint ?? 0) > 0
      ? Number(opts?.leagueIdHint)
      : null;

  const leagueCandidates: LeagueSummary[] = [];
  if (hintedLeagueId) {
    try {
      leagueCandidates.push(await queryClient.fetchQuery(leagueQuery(hintedLeagueId)));
    } catch {
      // Hint is best-effort; fall back to the full league list.
    }
  }

  try {
    const leagues = await queryClient.fetchQuery(leaguesListQuery());
    for (const lg of leagues) {
      if (leagueCandidates.some((c) => c.id === lg.id)) continue;
      leagueCandidates.push(lg);
    }
  } catch {
    // Keep whatever candidates the hint produced.
  }
  if (leagueCandidates.length === 0) return null;

  let found: {
    league: LeagueSummary;
    season: SeasonMeta & { id: number };
  } | null = null;
  let leagueMembers: LeagueMember[] = [];

  for (const lg of leagueCandidates) {
    let seasons;
    try {
      seasons = await queryClient.fetchQuery(leagueSeasonsQuery(lg.id));
    } catch {
      continue;
    }
    const match = seasons.find((s) => s.id === seasonId) ?? null;
    if (!match) continue;

    found = { league: lg, season: match };
    try {
      leagueMembers = await queryClient.fetchQuery(leagueMembersQuery(lg.id));
    } catch {
      leagueMembers = [];
    }
    break;
  }

  if (!found) return null;

  let ceremonyStatus: string | null = null;
  try {
    const ceremonies = await queryClient.fetchQuery(ceremoniesListQuery());
    ceremonyStatus =
      ceremonies.find((c) => c.id === found.season.ceremony_id)?.status ?? null;
  } catch {
    ceremonyStatus = null;
  }

  return { league: found.league, season: found.season, leagueMembers, ceremonyStatus };
}
