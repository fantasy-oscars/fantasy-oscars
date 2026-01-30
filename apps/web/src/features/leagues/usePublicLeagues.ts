import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../../lib/api";
import type { ApiResult, LeagueSummary, PublicLeague } from "../../lib/types";

export function usePublicLeagues() {
  const [leagues, setLeagues] = useState<PublicLeague[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinResult, setJoinResult] = useState<ApiResult | null>(null);

  const refresh = useCallback(
    async (q?: string) => {
      setLoading(true);
      setError(null);
      const query = (q ?? search).trim();
      const url =
        query.length > 0
          ? `/leagues/public?q=${encodeURIComponent(query)}`
          : "/leagues/public";
      const res = await fetchJson<{ leagues: PublicLeague[] }>(url);
      setLoading(false);
      if (!res.ok) {
        setError(res.error ?? "Failed to load public leagues");
        setLeagues([]);
        return;
      }
      setLeagues(res.data?.leagues ?? []);
    },
    [search]
  );

  useEffect(() => {
    void refresh("");
  }, [refresh]);

  const joinPublic = useCallback(async (leagueId: number) => {
    setJoinResult(null);
    const res = await fetchJson<{ league: LeagueSummary }>(`/leagues/${leagueId}/join`, {
      method: "POST"
    });
    setJoinResult({
      ok: res.ok,
      message: res.ok ? "Joined league" : (res.error ?? "Join failed")
    });
    return { ok: res.ok as boolean };
  }, []);

  return {
    leagues,
    search,
    setSearch,
    loading,
    error,
    joinResult,
    refresh,
    joinPublic
  };
}
