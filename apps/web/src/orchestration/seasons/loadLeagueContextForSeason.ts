import { fetchJson } from "../../lib/api";
import type {
  CeremonySummary,
  LeagueMember,
  LeagueSummary,
  SeasonMeta
} from "../../lib/types";

export type LeagueContextForSeason = {
  league: LeagueSummary;
  season: SeasonMeta & { id: number };
  leagueMembers: LeagueMember[];
  ceremonyStatus: string | null;
};

export async function loadLeagueContextForSeason(
  seasonId: number,
  opts?: { leagueIdHint?: number | null }
): Promise<LeagueContextForSeason | null> {
  const hintedLeagueId =
    Number.isFinite(opts?.leagueIdHint) && (opts?.leagueIdHint ?? 0) > 0
      ? Number(opts?.leagueIdHint)
      : null;

  const leagueCandidates: LeagueSummary[] = [];
  if (hintedLeagueId) {
    const hintedLeagueRes = await fetchJson<{ league: LeagueSummary }>(
      `/leagues/${hintedLeagueId}`,
      { method: "GET" }
    );
    if (hintedLeagueRes.ok && hintedLeagueRes.data?.league) {
      leagueCandidates.push(hintedLeagueRes.data.league);
    }
  }

  const leaguesRes = await fetchJson<{ leagues: LeagueSummary[] }>("/leagues", {
    method: "GET"
  });
  if (leaguesRes.ok && leaguesRes.data?.leagues) {
    for (const lg of leaguesRes.data.leagues) {
      if (leagueCandidates.some((c) => c.id === lg.id)) continue;
      leagueCandidates.push(lg);
    }
  }
  if (leagueCandidates.length === 0) return null;

  let found: {
    league: LeagueSummary;
    season: (SeasonMeta & { id: number }) | null;
  } | null = null;
  let leagueMembers: LeagueMember[] = [];

  for (const lg of leagueCandidates) {
    const seasonsRes = await fetchJson<{ seasons: Array<SeasonMeta & { id: number }> }>(
      `/leagues/${lg.id}/seasons`,
      { method: "GET" }
    );
    if (!seasonsRes.ok) continue;
    const match = (seasonsRes.data?.seasons ?? []).find((s) => s.id === seasonId) ?? null;
    if (!match) continue;

    found = { league: lg, season: match };

    const rosterRes = await fetchJson<{ members: LeagueMember[] }>(
      `/leagues/${lg.id}/members`,
      { method: "GET" }
    );
    if (rosterRes.ok && rosterRes.data?.members) leagueMembers = rosterRes.data.members;
    break;
  }

  if (!found?.season) return null;

  const ceremoniesRes = await fetchJson<{ ceremonies: CeremonySummary[] }>(
    "/ceremonies",
    {
      method: "GET"
    }
  );
  const ceremonyStatus =
    ceremoniesRes.ok && ceremoniesRes.data?.ceremonies
      ? (ceremoniesRes.data.ceremonies.find((c) => c.id === found.season!.ceremony_id)
          ?.status ?? null)
      : null;

  return { league: found.league, season: found.season, leagueMembers, ceremonyStatus };
}
