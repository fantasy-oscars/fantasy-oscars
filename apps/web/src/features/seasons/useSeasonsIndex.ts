import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../../lib/api";
import type { LeagueSummary, SeasonSummary } from "../../lib/types";

export type SeasonsIndexRow = { league: LeagueSummary; seasons: SeasonSummary[] };
export type SeasonsIndexViewState = "loading" | "error" | "ready";

export function useSeasonsIndex() {
  const [state, setState] = useState<SeasonsIndexViewState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<SeasonsIndexRow[]>([]);

  const refresh = useCallback(async () => {
    setState("loading");
    setError(null);

    const leaguesRes = await fetchJson<{ leagues: LeagueSummary[] }>("/leagues");
    if (!leaguesRes.ok) {
      setError(leaguesRes.error ?? "Failed to load leagues");
      setRows([]);
      setState("error");
      return;
    }

    const leagues = leaguesRes.data?.leagues ?? [];
    const seasons = await Promise.all(
      leagues.map(async (league) => {
        const res = await fetchJson<{ seasons: SeasonSummary[] }>(
          `/leagues/${league.id}/seasons`
        );
        return { league, seasons: res.ok ? (res.data?.seasons ?? []) : [] };
      })
    );

    setRows(seasons);
    setState("ready");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, error, rows, refresh };
}
