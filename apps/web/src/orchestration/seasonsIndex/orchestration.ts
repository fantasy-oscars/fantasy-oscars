import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../../lib/api";
import type { CeremonySummary, LeagueSummary, SeasonSummary } from "../../lib/types";
import {
  buildSeasonIndexCards,
  type SeasonIndexCard
} from "../../decisions/seasons/seasonIndexCards";

export type SeasonsIndexView =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; seasons: SeasonIndexCard[] };

export function useSeasonsIndexOrchestration() {
  const [view, setView] = useState<SeasonsIndexView>({ state: "loading" });

  const refresh = useCallback(async () => {
    setView({ state: "loading" });

    const [leaguesRes, ceremoniesRes] = await Promise.all([
      fetchJson<{ leagues: LeagueSummary[] }>("/leagues"),
      fetchJson<{ ceremonies: CeremonySummary[] }>("/ceremonies")
    ]);

    if (!leaguesRes.ok) {
      setView({ state: "error", message: leaguesRes.error ?? "Failed to load leagues" });
      return;
    }
    if (!ceremoniesRes.ok) {
      setView({
        state: "error",
        message: ceremoniesRes.error ?? "Failed to load ceremonies"
      });
      return;
    }

    const leagues = leaguesRes.data?.leagues ?? [];
    const ceremonies = ceremoniesRes.data?.ceremonies ?? [];
    const ceremonyById = new Map<number, CeremonySummary>();
    for (const c of ceremonies) ceremonyById.set(c.id, c);

    const seasonResults = await Promise.all(
      leagues.map(async (league) => {
        const res = await fetchJson<{ seasons: SeasonSummary[] }>(
          `/leagues/${league.id}/seasons`
        );
        return { league, seasons: res.ok ? (res.data?.seasons ?? []) : [] };
      })
    );

    const all = buildSeasonIndexCards({ seasonResults, ceremonyById });

    setView({ state: "ready", seasons: all });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(() => ({ view, refresh }), [view, refresh]);
}
