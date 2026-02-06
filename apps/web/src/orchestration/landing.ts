import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../lib/api";
import type { LeagueSummary, SeasonSummary, CeremonySummary } from "../lib/types";

type StaticContent = { key: string; title: string; body_markdown: string };
type DynamicContent = {
  id: number;
  key: string;
  title: string;
  body_markdown: string;
  published_at: string | null;
};

export type LandingBlurbView =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; content: StaticContent };

export type LandingUpdatesView =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; content: DynamicContent | null };

export type LandingSeasonPreview = SeasonSummary & {
  league_name: string;
  league_code: string;
  ceremony_name: string | null;
};

export type LandingSeasonsView =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; seasons: LandingSeasonPreview[]; total: number };

export type LandingView = {
  blurb: LandingBlurbView;
  updates: LandingUpdatesView;
  seasons: LandingSeasonsView;
};

async function loadStaticContent(key: string) {
  return fetchJson<{ content: StaticContent }>(`/content/static/${encodeURIComponent(key)}`, {
    method: "GET"
  });
}

async function loadDynamicContent(key: string) {
  return fetchJson<{ content: DynamicContent | null }>(`/content/dynamic/${encodeURIComponent(key)}`, {
    method: "GET"
  });
}

async function loadCeremonies(): Promise<CeremonySummary[]> {
  const res = await fetchJson<{ ceremonies: CeremonySummary[] }>("/ceremonies/active", {
    method: "GET"
  });
  if (!res.ok) throw new Error(res.error ?? "Failed to load ceremonies");
  return res.data?.ceremonies ?? [];
}

async function loadSeasonPreview(ceremonyNameById: Map<number, string>): Promise<LandingSeasonPreview[]> {
  const leaguesRes = await fetchJson<{ leagues: LeagueSummary[] }>("/leagues");
  if (!leaguesRes.ok) throw new Error(leaguesRes.error ?? "Failed to load leagues");
  const leagues = leaguesRes.data?.leagues ?? [];

  const seasonResults = await Promise.all(
    leagues.map(async (league) => {
      const res = await fetchJson<{ seasons: SeasonSummary[] }>(`/leagues/${league.id}/seasons`);
      return { league, seasons: res.ok ? (res.data?.seasons ?? []) : [] };
    })
  );

  const allSeasons: LandingSeasonPreview[] = seasonResults.flatMap(({ league, seasons }) =>
    seasons.map((s) => ({
      ...s,
      league_name: league.name,
      league_code: league.code,
      ceremony_name: ceremonyNameById.get(s.ceremony_id) ?? null
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

export function useLandingOrchestration(opts: { seasonsEnabled: boolean }) {
  const { seasonsEnabled } = opts;

  const [blurb, setBlurb] = useState<LandingBlurbView>({ state: "loading" });
  const [updates, setUpdates] = useState<LandingUpdatesView>({ state: "loading" });
  const [seasons, setSeasons] = useState<LandingSeasonsView>({ state: "idle" });

  const refreshBlurb = useCallback(async () => {
    setBlurb({ state: "loading" });
    const res = await loadStaticContent("landing_blurb");
    if (!res.ok || !res.data?.content) {
      setBlurb({ state: "error", message: res.error ?? "Failed to load content" });
      return;
    }
    setBlurb({ state: "ready", content: res.data.content });
  }, []);

  const refreshUpdates = useCallback(async () => {
    setUpdates({ state: "loading" });
    const res = await loadDynamicContent("home_main");
    if (!res.ok) {
      setUpdates({ state: "error", message: res.error ?? "Failed to load content" });
      return;
    }
    setUpdates({ state: "ready", content: res.data?.content ?? null });
  }, []);

  const refreshSeasons = useCallback(async () => {
    if (!seasonsEnabled) {
      setSeasons({ state: "idle" });
      return;
    }
    setSeasons({ state: "loading" });
    try {
      const ceremonies = await loadCeremonies();
      const nameById = new Map<number, string>();
      for (const c of ceremonies) nameById.set(c.id, c.name);
      const active = await loadSeasonPreview(nameById);
      setSeasons({ state: "ready", total: active.length, seasons: active.slice(0, 2) });
    } catch (err) {
      setSeasons({
        state: "error",
        message: err instanceof Error ? err.message : "Failed to load seasons"
      });
    }
  }, [seasonsEnabled]);

  useEffect(() => void refreshBlurb(), [refreshBlurb]);
  useEffect(() => void refreshUpdates(), [refreshUpdates]);
  useEffect(() => void refreshSeasons(), [refreshSeasons]);

  const view: LandingView = useMemo(() => ({ blurb, updates, seasons }), [blurb, updates, seasons]);
  return { view, refresh: { blurb: refreshBlurb, updates: refreshUpdates, seasons: refreshSeasons } };
}

