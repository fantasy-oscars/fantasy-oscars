import type { Root } from "mdast";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../../lib/api";
import type { LeagueSummary, SeasonSummary } from "../../lib/types";
import {
  computeActiveSeasonPreviews,
  type HomeSeasonPreview
} from "../../decisions/home/seasonPreviews";

type DynamicContent = {
  id: number;
  key: string;
  title: string;
  body_markdown: string;
  /** The parsed `body_markdown`, from the API. */
  body_tree: Root | null;
  published_at: string | null;
};

export type HomeMainView =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; content: DynamicContent | null };

export type HomeSeasonPreviewView =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; seasons: HomeSeasonPreview[]; total: number };

export type HomeView = {
  homeMain: HomeMainView;
  seasons: HomeSeasonPreviewView;
};

async function loadDynamicContent(key: string) {
  return fetchJson<{ content: DynamicContent | null }>(
    `/content/dynamic/${encodeURIComponent(key)}`,
    { method: "GET" }
  );
}

async function loadSeasonPreview(): Promise<HomeSeasonPreview[]> {
  const leaguesRes = await fetchJson<{ leagues: LeagueSummary[] }>("/leagues");
  if (!leaguesRes.ok) throw new Error(leaguesRes.error ?? "Failed to load leagues");
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

  return computeActiveSeasonPreviews(seasonResults);
}

export function useHomeOrchestration(opts: { seasonsEnabled: boolean }) {
  const { seasonsEnabled } = opts;

  const [homeMain, setHomeMain] = useState<HomeMainView>({ state: "loading" });
  const [seasons, setSeasons] = useState<HomeSeasonPreviewView>({ state: "idle" });

  const refreshHomeMain = useCallback(async () => {
    setHomeMain((prev) => (prev.state === "ready" ? prev : { state: "loading" }));
    const res = await loadDynamicContent("home_main");
    if (!res.ok) {
      setHomeMain((prev) =>
        prev.state === "ready"
          ? prev
          : { state: "error", message: res.error ?? "Failed to load content" }
      );
      return;
    }
    setHomeMain({ state: "ready", content: res.data?.content ?? null });
  }, []);

  const refreshSeasons = useCallback(async () => {
    if (!seasonsEnabled) {
      setSeasons({ state: "idle" });
      return;
    }

    setSeasons((prev) => (prev.state === "ready" ? prev : { state: "loading" }));
    try {
      const active = await loadSeasonPreview();
      setSeasons({ state: "ready", total: active.length, seasons: active.slice(0, 2) });
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

  useEffect(() => {
    void refreshHomeMain();
  }, [refreshHomeMain]);

  useEffect(() => {
    void refreshSeasons();
  }, [refreshSeasons]);

  const view: HomeView = useMemo(() => ({ homeMain, seasons }), [homeMain, seasons]);

  return {
    view,
    refresh: {
      homeMain: refreshHomeMain,
      seasons: refreshSeasons
    }
  };
}
