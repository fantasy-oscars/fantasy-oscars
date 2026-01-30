import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../../lib/api";
import type { LeagueSummary } from "../../lib/types";

export type LeaguesViewState = "loading" | "empty" | "error" | "ready";

export function useMyLeagues() {
  const [state, setState] = useState<LeaguesViewState>("loading");
  const [leagues, setLeagues] = useState<LeagueSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setState("loading");
    setError(null);
    const res = await fetchJson<{ leagues: LeagueSummary[] }>("/leagues");
    if (!res.ok) {
      setError(res.error ?? "Failed to load leagues");
      setLeagues([]);
      setState("error");
      return;
    }
    const next = res.data?.leagues ?? [];
    setLeagues(next);
    setState(next.length === 0 ? "empty" : "ready");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createLeague = useCallback(
    async (input: { name: string }) => {
      setCreateError(null);
      setCreateLoading(true);
      const res = await fetchJson<{ league: LeagueSummary }>("/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });
      setCreateLoading(false);
      if (!res.ok) {
        setCreateError(res.error ?? "Could not create league");
        return { ok: false as const, error: res.error };
      }
      await refresh();
      return { ok: true as const, league: res.data?.league };
    },
    [refresh]
  );

  return {
    state,
    leagues,
    error,
    refresh,
    createLeague,
    createLoading,
    createError
  };
}
