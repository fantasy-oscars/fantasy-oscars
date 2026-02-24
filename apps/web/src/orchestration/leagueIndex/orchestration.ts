import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../../lib/api";
import type { LeagueMember, LeagueSummary, SeasonSummary } from "../../lib/types";
import {
  buildLeagueIndexRows,
  type LeagueIndexRow
} from "../../decisions/leagues/leagueIndex";

export type LeagueIndexView =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; leagues: LeagueIndexRow[] };

export function useLeagueIndexOrchestration() {
  const [view, setView] = useState<LeagueIndexView>({ state: "loading" });

  const refresh = useCallback(async () => {
    // Global refresh policy: keep results visible during refresh.
    setView((prev) => (prev.state === "ready" ? prev : { state: "loading" }));
    const leaguesRes = await fetchJson<{ leagues: LeagueSummary[] }>("/leagues");
    if (!leaguesRes.ok) {
      setView((prev) =>
        prev.state === "ready"
          ? prev
          : { state: "error", message: leaguesRes.error ?? "Failed to load leagues" }
      );
      return;
    }
    const leagues = leaguesRes.data?.leagues ?? [];

    const detailRows = await Promise.all(
      leagues.map(async (l) => {
        const [seasonsRes, membersRes] = await Promise.all([
          fetchJson<{ seasons: SeasonSummary[] }>(`/leagues/${l.id}/seasons`),
          fetchJson<{ members: LeagueMember[] }>(`/leagues/${l.id}/members`)
        ]);
        return {
          leagueId: l.id,
          seasons: seasonsRes.ok ? (seasonsRes.data?.seasons ?? []) : [],
          members: membersRes.ok ? (membersRes.data?.members ?? []) : null
        };
      })
    );

    const leagueSeasons: Record<number, SeasonSummary[]> = {};
    const leagueMembers: Record<number, LeagueMember[] | null> = {};
    for (const row of detailRows) {
      leagueSeasons[row.leagueId] = row.seasons;
      leagueMembers[row.leagueId] = row.members;
    }

    setView({
      state: "ready",
      leagues: buildLeagueIndexRows({ leagues, leagueSeasons, leagueMembers })
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(() => ({ view, refresh }), [view, refresh]);
}
