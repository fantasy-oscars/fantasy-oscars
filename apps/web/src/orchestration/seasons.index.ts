import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../lib/api";
import type { LeagueSummary, SeasonSummary } from "../lib/types";

export type SeasonsIndexRow = { league: LeagueSummary; seasons: SeasonSummary[] };
export type SeasonsIndexView =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; rows: SeasonsIndexRow[] };

export function useSeasonsIndexOrchestration() {
  const [view, setView] = useState<SeasonsIndexView>({ state: "loading" });

  const refresh = useCallback(async () => {
    setView({ state: "loading" });

    const leaguesRes = await fetchJson<{ leagues: LeagueSummary[] }>("/leagues");
    if (!leaguesRes.ok) {
      setView({ state: "error", message: leaguesRes.error ?? "Failed to load leagues" });
      return;
    }

    const leagues = leaguesRes.data?.leagues ?? [];
    const rows = await Promise.all(
      leagues.map(async (league) => {
        const res = await fetchJson<{ seasons: SeasonSummary[] }>(
          `/leagues/${league.id}/seasons`
        );
        return { league, seasons: res.ok ? (res.data?.seasons ?? []) : [] };
      })
    );

    setView({ state: "ready", rows });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { view, refresh };
}

