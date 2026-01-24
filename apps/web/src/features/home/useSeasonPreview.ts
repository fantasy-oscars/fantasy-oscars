import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../../lib/api";
import type { LeagueSummary, SeasonSummary } from "../../lib/types";

export type SeasonPreview = SeasonSummary & {
  league_name: string;
  league_code: string;
};

export type SeasonPreviewState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; seasons: SeasonPreview[]; total: number };

export function useSeasonPreview(opts: { enabled: boolean }) {
  const { enabled } = opts;
  const [state, setState] = useState<SeasonPreviewState>({ state: "idle" });

  const refresh = useCallback(async () => {
    if (!enabled) {
      setState({ state: "idle" });
      return;
    }

    setState({ state: "loading" });
    const leaguesRes = await fetchJson<{ leagues: LeagueSummary[] }>("/leagues");
    if (!leaguesRes.ok) {
      setState({
        state: "error",
        message: leaguesRes.error ?? "Failed to load leagues"
      });
      return;
    }

    const leagues = leaguesRes.data?.leagues ?? [];
    const seasonResults = await Promise.all(
      leagues.map(async (league) => {
        const res = await fetchJson<{ seasons: SeasonSummary[] }>(
          `/leagues/${league.id}/seasons`
        );
        return {
          league,
          seasons: res.ok ? (res.data?.seasons ?? []) : []
        };
      })
    );

    const allSeasons: SeasonPreview[] = seasonResults.flatMap(({ league, seasons }) =>
      seasons.map((s) => ({
        ...s,
        league_name: league.name,
        league_code: league.code
      }))
    );

    const activeSeasons = allSeasons
      .filter((s) => Boolean(s.is_active_ceremony))
      .filter((s) => s.status !== "CANCELLED");

    activeSeasons.sort((a, b) => {
      const at = Date.parse(a.created_at ?? "") || 0;
      const bt = Date.parse(b.created_at ?? "") || 0;
      if (bt !== at) return bt - at;
      return a.id - b.id;
    });

    setState({
      state: "ready",
      total: activeSeasons.length,
      seasons: activeSeasons.slice(0, 2)
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setState({ state: "idle" });
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  return { state, refresh };
}

