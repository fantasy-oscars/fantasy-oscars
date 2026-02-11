import type { LeagueMember, LeagueSummary, SeasonSummary } from "../../lib/types";

export type LeagueIndexRow = {
  id: number;
  name: string;
  commissioner_name: string | null;
  active_seasons_count: number;
  active_season_recency_ts: number | null;
};

function computeActiveSeasonStats(seasons: SeasonSummary[]) {
  const active = seasons
    .filter((s) => Boolean(s.is_active_ceremony))
    .filter((s) => s.status !== "CANCELLED");
  const count = active.length;
  const recency = active.reduce((max, s) => {
    const ts = Date.parse(s.created_at ?? "") || 0;
    return ts > max ? ts : max;
  }, 0);
  return { count, recency_ts: recency > 0 ? recency : null };
}

function pickCommissionerName(members: LeagueMember[] | null) {
  if (!members || members.length === 0) return null;
  const owner = members.find((m) => m.role === "OWNER");
  return (owner ?? members[0]).username ?? null;
}

export function buildLeagueIndexRows(args: {
  leagues: LeagueSummary[];
  leagueSeasons: Record<number, SeasonSummary[]>;
  leagueMembers: Record<number, LeagueMember[] | null>;
}): LeagueIndexRow[] {
  const { leagues, leagueSeasons, leagueMembers } = args;
  const rows: LeagueIndexRow[] = leagues.map((l) => {
    const seasons = leagueSeasons[l.id] ?? [];
    const members = typeof leagueMembers[l.id] === "undefined" ? null : leagueMembers[l.id];
    const stats = computeActiveSeasonStats(seasons);
    return {
      id: l.id,
      name: l.name,
      commissioner_name: pickCommissionerName(members),
      active_seasons_count: stats.count,
      active_season_recency_ts: stats.recency_ts
    };
  });

  rows.sort((a, b) => {
    if (b.active_seasons_count !== a.active_seasons_count)
      return b.active_seasons_count - a.active_seasons_count;
    const ar = a.active_season_recency_ts ?? 0;
    const br = b.active_season_recency_ts ?? 0;
    if (br !== ar) return br - ar;
    return a.id - b.id;
  });

  return rows;
}

