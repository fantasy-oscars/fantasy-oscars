import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../../lib/api";
import type { ApiResult, CeremonySummary, LeagueDetail } from "../../lib/types";

export type LeagueSeasonCreateViewState = "loading" | "error" | "ready" | "forbidden";

export function useLeagueSeasonCreate(input: { leagueId: number }) {
  const { leagueId } = input;

  const [state, setState] = useState<LeagueSeasonCreateViewState>("loading");
  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [ceremonies, setCeremonies] = useState<CeremonySummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<ApiResult | null>(null);

  const refresh = useCallback(async () => {
    if (!Number.isFinite(leagueId) || leagueId <= 0) {
      setState("error");
      setError("Invalid league id");
      return;
    }

    setState("loading");
    setError(null);

    const [leagueRes, ceremoniesRes] = await Promise.all([
      fetchJson<{ league: LeagueDetail }>(`/leagues/${leagueId}`, { method: "GET" }),
      fetchJson<{ ceremonies: CeremonySummary[] }>(`/ceremonies/published`, {
        method: "GET"
      })
    ]);

    if (!leagueRes.ok) {
      setError(leagueRes.error ?? "Unable to load league");
      setState(leagueRes.errorCode === "FORBIDDEN" ? "forbidden" : "error");
      return;
    }

    setLeague(leagueRes.data?.league ?? null);
    setCeremonies(ceremoniesRes.ok ? (ceremoniesRes.data?.ceremonies ?? []) : []);
    setState("ready");
  }, [leagueId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createSeason = useCallback(
    async (input: {
      ceremonyId: number;
      scoringStrategy: "fixed" | "negative";
      remainderStrategy: "UNDRAFTED" | "FULL_POOL";
    }) => {
      if (!Number.isFinite(leagueId) || leagueId <= 0) return { ok: false as const };
      const ceremonyId = input.ceremonyId;
      if (!Number.isFinite(ceremonyId) || ceremonyId <= 0) return { ok: false as const };

      setWorking(true);
      setStatus(null);
      const res = await fetchJson<{ season: { id: number } }>(
        `/leagues/${leagueId}/seasons`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ceremony_id: ceremonyId,
            scoring_strategy_name: input.scoringStrategy,
            remainder_strategy: input.remainderStrategy
          })
        }
      );
      setWorking(false);

      if (!res.ok) {
        setStatus({ ok: false, message: res.error ?? "Failed to create season" });
        return { ok: false as const };
      }

      const seasonId = res.data?.season?.id;
      if (!seasonId) {
        setStatus({ ok: false, message: "Season created, but response was missing id" });
        return { ok: false as const };
      }

      setStatus({ ok: true, message: "Season created" });
      return { ok: true as const, seasonId };
    },
    [leagueId]
  );

  return {
    state,
    league,
    ceremonies,
    error,
    working,
    status,
    setStatus,
    refresh,
    createSeason
  };
}
