import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../lib/api";
import type { CeremonySummary, LeagueSummary, SeasonSummary } from "../lib/types";

export type SeasonIndexCard = {
  season_id: number;
  league_id: number;
  league_name: string;
  ceremony_id: number;
  ceremony_name: string;
  ceremony_sort_ts: number;
  status_label: "Open" | "Drafting" | "Complete" | "Archived";
};

export type SeasonsIndexBaselineView =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; seasons: SeasonIndexCard[] };

function ceremonySortTs(ceremony: CeremonySummary): number {
  const ts = ceremony.starts_at ? Date.parse(ceremony.starts_at) : NaN;
  if (Number.isFinite(ts)) return ts;
  const year = typeof ceremony.year === "number" ? ceremony.year : NaN;
  return Number.isFinite(year) ? Date.UTC(year, 0, 1) : 0;
}

function statusLabel(season: SeasonSummary): SeasonIndexCard["status_label"] {
  const draft = (season.draft_status ?? "").toUpperCase();
  if (draft === "LIVE" || draft === "IN_PROGRESS") return "Drafting";
  if (draft === "COMPLETED") return "Complete";

  // Season "archive" concept is a mix of ceremony activity and season status in this app.
  // Keep user-facing vocabulary constrained to the spec.
  if (season.status !== "EXTANT") return "Archived";
  if (season.is_active_ceremony === false) return "Archived";
  if (!season.draft_id) return "Open";
  return "Open";
}

export function useSeasonsIndexBaselineOrchestration() {
  const [view, setView] = useState<SeasonsIndexBaselineView>({ state: "loading" });

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

    const all: SeasonIndexCard[] = seasonResults.flatMap(({ league, seasons }) =>
      seasons.map((s) => {
        const ceremony = ceremonyById.get(s.ceremony_id);
        return {
          season_id: s.id,
          league_id: league.id,
          league_name: league.name,
          ceremony_id: s.ceremony_id,
          ceremony_name: ceremony?.name ?? `Ceremony ${s.ceremony_id}`,
          ceremony_sort_ts: ceremony ? ceremonySortTs(ceremony) : 0,
          status_label: statusLabel(s)
        };
      })
    );

    setView({ state: "ready", seasons: all });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(() => ({ view, refresh }), [view, refresh]);
}

