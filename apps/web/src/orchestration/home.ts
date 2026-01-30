import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../lib/api";
import type { LeagueSummary, SeasonSummary } from "../lib/types";

type StaticContent = { key: string; title: string; body_markdown: string };
type DynamicContent = {
  id: number;
  key: string;
  title: string;
  body_markdown: string;
  published_at: string | null;
};

export type HomeLandingBlurbView =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; content: StaticContent };

export type HomeMainView =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; content: DynamicContent | null };

export type HomeSeasonPreview = SeasonSummary & {
  league_name: string;
  league_code: string;
};

export type HomeSeasonPreviewView =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; seasons: HomeSeasonPreview[]; total: number };

export type HomeView = {
  landingBlurb: HomeLandingBlurbView;
  homeMain: HomeMainView;
  seasons: HomeSeasonPreviewView;
};

async function loadStaticContent(key: string) {
  return fetchJson<{ content: StaticContent }>(
    `/content/static/${encodeURIComponent(key)}`,
    {
      method: "GET"
    }
  );
}

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

  const allSeasons: HomeSeasonPreview[] = seasonResults.flatMap(({ league, seasons }) =>
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

  return activeSeasons;
}

export function useHomeOrchestration(opts: { seasonsEnabled: boolean }) {
  const { seasonsEnabled } = opts;

  const [landingBlurb, setLandingBlurb] = useState<HomeLandingBlurbView>({
    state: "loading"
  });
  const [homeMain, setHomeMain] = useState<HomeMainView>({ state: "loading" });
  const [seasons, setSeasons] = useState<HomeSeasonPreviewView>({ state: "idle" });

  const refreshLandingBlurb = useCallback(async () => {
    setLandingBlurb({ state: "loading" });
    const res = await loadStaticContent("landing_blurb");
    if (!res.ok) {
      setLandingBlurb({ state: "error", message: res.error ?? "Failed to load content" });
      return;
    }
    const content = res.data?.content;
    if (!content) {
      setLandingBlurb({ state: "error", message: "Content not found" });
      return;
    }
    setLandingBlurb({ state: "ready", content });
  }, []);

  const refreshHomeMain = useCallback(async () => {
    setHomeMain({ state: "loading" });
    const res = await loadDynamicContent("home_main");
    if (!res.ok) {
      setHomeMain({ state: "error", message: res.error ?? "Failed to load content" });
      return;
    }
    setHomeMain({ state: "ready", content: res.data?.content ?? null });
  }, []);

  const refreshSeasons = useCallback(async () => {
    if (!seasonsEnabled) {
      setSeasons({ state: "idle" });
      return;
    }

    setSeasons({ state: "loading" });
    try {
      const active = await loadSeasonPreview();
      setSeasons({ state: "ready", total: active.length, seasons: active.slice(0, 2) });
    } catch (err) {
      setSeasons({
        state: "error",
        message: err instanceof Error ? err.message : "Failed to load seasons"
      });
    }
  }, [seasonsEnabled]);

  useEffect(() => {
    void refreshLandingBlurb();
  }, [refreshLandingBlurb]);

  useEffect(() => {
    void refreshHomeMain();
  }, [refreshHomeMain]);

  useEffect(() => {
    void refreshSeasons();
  }, [refreshSeasons]);

  const view: HomeView = useMemo(
    () => ({ landingBlurb, homeMain, seasons }),
    [landingBlurb, homeMain, seasons]
  );

  return {
    view,
    refresh: {
      landingBlurb: refreshLandingBlurb,
      homeMain: refreshHomeMain,
      seasons: refreshSeasons
    }
  };
}
