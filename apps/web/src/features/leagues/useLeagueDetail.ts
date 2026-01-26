import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../../lib/api";
import type {
  ApiResult,
  LeagueDetail,
  LeagueMember,
  SeasonSummary
} from "../../lib/types";

export type LeagueDetailViewState = "loading" | "error" | "ready" | "forbidden";

export function useLeagueDetail(input: { leagueId: number; userSub?: string }) {
  const { leagueId, userSub } = input;

  const [state, setState] = useState<LeagueDetailViewState>("loading");
  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [roster, setRoster] = useState<LeagueMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [rosterStatus, setRosterStatus] = useState<ApiResult | null>(null);

  const refresh = useCallback(async () => {
    if (Number.isNaN(leagueId)) {
      setState("error");
      setError("Invalid league id");
      return;
    }

    setState("loading");
    setError(null);

    const [detail, seasonRes, rosterRes] = await Promise.all([
      fetchJson<{ league: LeagueDetail }>(`/leagues/${leagueId}`),
      fetchJson<{ seasons: SeasonSummary[] }>(`/leagues/${leagueId}/seasons`),
      fetchJson<{ members: LeagueMember[] }>(`/leagues/${leagueId}/members`)
    ]);

    if (!detail.ok) {
      setError(detail.error ?? "Unable to load league");
      setState(detail.errorCode === "FORBIDDEN" ? "forbidden" : "error");
      return;
    }

    setLeague(detail.data?.league ?? null);
    setSeasons(seasonRes.ok ? (seasonRes.data?.seasons ?? []) : []);
    setRoster(rosterRes.ok ? (rosterRes.data?.members ?? []) : null); // hide if forbidden
    setState("ready");
  }, [leagueId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const userId = useMemo(() => Number(userSub), [userSub]);

  const isCommissioner = useMemo(() => {
    if (!Number.isFinite(userId)) return false;
    return !!roster?.some(
      (m) => m.user_id === userId && (m.role === "OWNER" || m.role === "CO_OWNER")
    );
  }, [roster, userId]);

  const isOwner = useMemo(() => {
    if (!Number.isFinite(userId)) return false;
    return !!roster?.some((m) => m.user_id === userId && m.role === "OWNER");
  }, [roster, userId]);

  const transferOwnership = useCallback(
    async (targetUserId: number) => {
      if (!league) return { ok: false as const };
      if (!Number.isFinite(targetUserId)) return { ok: false as const };
      setWorking(true);
      setRosterStatus(null);
      const res = await fetchJson(`/leagues/${league.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: targetUserId })
      });
      setWorking(false);
      if (res.ok) {
        setRosterStatus({ ok: true, message: "Commissioner role transferred" });
        await refresh();
        return { ok: true as const };
      }
      setRosterStatus({ ok: false, message: res.error ?? "Transfer failed" });
      return { ok: false as const };
    },
    [league, refresh]
  );

  const removeMember = useCallback(
    async (memberUserId: number) => {
      if (!league) return { ok: false as const };
      if (!Number.isFinite(memberUserId)) return { ok: false as const };
      setWorking(true);
      setRosterStatus(null);
      const res = await fetchJson(`/leagues/${league.id}/members/${memberUserId}`, {
        method: "DELETE"
      });
      setWorking(false);
      if (res.ok) {
        setRoster((prev) =>
          prev ? prev.filter((m) => m.user_id !== memberUserId) : prev
        );
        setRosterStatus({ ok: true, message: "Member removed" });
        return { ok: true as const };
      }
      setRosterStatus({ ok: false, message: res.error ?? "Remove failed" });
      return { ok: false as const };
    },
    [league]
  );

  return {
    state,
    league,
    seasons,
    roster,
    error,
    working,
    rosterStatus,
    setRosterStatus,
    refresh,
    isCommissioner,
    isOwner,
    transferOwnership,
    removeMember
  };
}
