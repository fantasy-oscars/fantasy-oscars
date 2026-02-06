import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../lib/api";
import type { LeagueMember, LeagueSummary, SeasonSummary } from "../lib/types";

export type LeagueIndexRow = {
  id: number;
  name: string;
  commissioner_name: string | null;
  active_seasons_count: number;
  active_season_recency_ts: number | null;
};

export type LeagueIndexView =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; leagues: LeagueIndexRow[] };

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

export function useLeagueIndexOrchestration() {
  const [view, setView] = useState<LeagueIndexView>({ state: "loading" });

  const refresh = useCallback(async () => {
    setView({ state: "loading" });
    const leaguesRes = await fetchJson<{ leagues: LeagueSummary[] }>("/leagues");
    if (!leaguesRes.ok) {
      setView({ state: "error", message: leaguesRes.error ?? "Failed to load leagues" });
      return;
    }
    const leagues = leaguesRes.data?.leagues ?? [];

    const details = await Promise.all(
      leagues.map(async (l) => {
        const [seasonsRes, membersRes] = await Promise.all([
          fetchJson<{ seasons: SeasonSummary[] }>(`/leagues/${l.id}/seasons`),
          fetchJson<{ members: LeagueMember[] }>(`/leagues/${l.id}/members`)
        ]);
        const seasons = seasonsRes.ok ? (seasonsRes.data?.seasons ?? []) : [];
        const members = membersRes.ok ? (membersRes.data?.members ?? []) : null;
        const stats = computeActiveSeasonStats(seasons);
        return {
          id: l.id,
          name: l.name,
          commissioner_name: pickCommissionerName(members),
          active_seasons_count: stats.count,
          active_season_recency_ts: stats.recency_ts
        } satisfies LeagueIndexRow;
      })
    );

    details.sort((a, b) => {
      if (b.active_seasons_count !== a.active_seasons_count)
        return b.active_seasons_count - a.active_seasons_count;
      const ar = a.active_season_recency_ts ?? 0;
      const br = b.active_season_recency_ts ?? 0;
      if (br !== ar) return br - ar;
      return a.id - b.id;
    });

    setView({ state: "ready", leagues: details });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(() => ({ view, refresh }), [view, refresh]);
}
