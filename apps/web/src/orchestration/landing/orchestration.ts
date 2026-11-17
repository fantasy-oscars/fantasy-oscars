import type { Root } from "mdast";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../../lib/api";
import type {
  CircuitLeagueSummary,
  LeagueSummary,
  SeasonSummary,
  CeremonySummary
} from "../../lib/types";
import {
  computeActiveLandingSeasonPreviews,
  computeLandingCircuitPreviews,
  type LandingCircuitPreview,
  type LandingSeasonPreview
} from "../../decisions/landing/seasonPreviews";

type DynamicContent = {
  id: number;
  key: string;
  title: string;
  body_markdown: string;
  /** The parsed `body_markdown`, from the API. */
  body_tree: Root | null;
  published_at: string | null;
};

export type LandingUpdatesView =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; content: DynamicContent | null };

export type LandingSeasonsView =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error"; message: string }
  | {
      state: "ready";
      seasons: LandingSeasonPreview[];
      /** The viewer's Circuit competitions, listed beside the Seasons. */
      circuits: LandingCircuitPreview[];
      total: number;
    };

export type LandingView = {
  updates: LandingUpdatesView;
  seasons: LandingSeasonsView;
};

async function loadDynamicContent(key: string) {
  return fetchJson<{ content: DynamicContent | null }>(
    `/content/dynamic/${encodeURIComponent(key)}`,
    {
      method: "GET"
    }
  );
}

async function loadCeremonies(): Promise<CeremonySummary[]> {
  const res = await fetchJson<{ ceremonies: CeremonySummary[] }>("/ceremonies/active", {
    method: "GET"
  });
  if (!res.ok) throw new Error(res.error ?? "Failed to load ceremonies");
  return res.data?.ceremonies ?? [];
}

async function loadSeasonPreview(ceremonyNameById: Map<number, string>): Promise<{
  seasons: LandingSeasonPreview[];
  circuits: LandingCircuitPreview[];
}> {
  const leaguesRes = await fetchJson<{ leagues: LeagueSummary[] }>("/leagues");
  if (!leaguesRes.ok) throw new Error(leaguesRes.error ?? "Failed to load leagues");
  const leagues = leaguesRes.data?.leagues ?? [];

  const [seasonResults, circuitResults] = await Promise.all([
    Promise.all(
      leagues.map(async (league) => {
        const res = await fetchJson<{ seasons: SeasonSummary[] }>(
          `/leagues/${league.id}/seasons`
        );
        return { league, seasons: res.ok ? (res.data?.seasons ?? []) : [] };
      })
    ),
    Promise.all(
      leagues.map(async (league) => {
        const res = await fetchJson<{ circuit_leagues: CircuitLeagueSummary[] }>(
          `/leagues/${league.id}/circuits`
        );
        return {
          league,
          circuitLeagues: res.ok ? (res.data?.circuit_leagues ?? []) : []
        };
      })
    )
  ]);
  return {
    seasons: computeActiveLandingSeasonPreviews(seasonResults, ceremonyNameById),
    circuits: computeLandingCircuitPreviews(circuitResults)
  };
}

export function useLandingOrchestration(opts: { seasonsEnabled: boolean }) {
  const { seasonsEnabled } = opts;

  const [updates, setUpdates] = useState<LandingUpdatesView>({ state: "loading" });
  const [seasons, setSeasons] = useState<LandingSeasonsView>({ state: "idle" });

  const refreshUpdates = useCallback(async () => {
    setUpdates((prev) => (prev.state === "ready" ? prev : { state: "loading" }));
    const res = await loadDynamicContent("home_main");
    if (!res.ok) {
      setUpdates((prev) =>
        prev.state === "ready"
          ? prev
          : { state: "error", message: res.error ?? "Failed to load content" }
      );
      return;
    }
    setUpdates({ state: "ready", content: res.data?.content ?? null });
  }, []);

  const refreshSeasons = useCallback(async () => {
    if (!seasonsEnabled) {
      setSeasons({ state: "idle" });
      return;
    }
    setSeasons((prev) => (prev.state === "ready" ? prev : { state: "loading" }));
    try {
      const ceremonies = await loadCeremonies();
      const nameById = new Map<number, string>();
      for (const c of ceremonies) nameById.set(c.id, c.name);
      const active = await loadSeasonPreview(nameById);
      setSeasons({
        state: "ready",
        total: active.seasons.length + active.circuits.length,
        seasons: active.seasons.slice(0, 2),
        circuits: active.circuits.slice(0, 2)
      });
    } catch (err) {
      setSeasons((prev) =>
        prev.state === "ready"
          ? prev
          : {
              state: "error",
              message: err instanceof Error ? err.message : "Failed to load seasons"
            }
      );
    }
  }, [seasonsEnabled]);

  useEffect(() => void refreshUpdates(), [refreshUpdates]);
  useEffect(() => void refreshSeasons(), [refreshSeasons]);

  const view: LandingView = useMemo(() => ({ updates, seasons }), [updates, seasons]);
  return {
    view,
    refresh: { updates: refreshUpdates, seasons: refreshSeasons }
  };
}
