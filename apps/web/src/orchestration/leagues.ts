import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../lib/api";
import type {
  ApiResult,
  LeagueDetail,
  LeagueMember,
  LeagueSummary,
  SeasonSummary
} from "../lib/types";

export type LeaguesIndexView =
  | { state: "loading" }
  | { state: "empty" }
  | { state: "error"; message: string }
  | { state: "ready"; leagues: LeagueSummary[] };

export function useLeaguesIndexOrchestration() {
  const [view, setView] = useState<LeaguesIndexView>({ state: "loading" });

  const refresh = useCallback(async () => {
    setView({ state: "loading" });
    const res = await fetchJson<{ leagues: LeagueSummary[] }>("/leagues");
    if (!res.ok) {
      setView({ state: "error", message: res.error ?? "Failed to load leagues" });
      return;
    }
    const leagues = res.data?.leagues ?? [];
    setView(leagues.length ? { state: "ready", leagues } : { state: "empty" });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { view, refresh };
}

export function useLeagueCreateOrchestration() {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: { name: string }) => {
    setError(null);
    setCreating(true);
    const res = await fetchJson<{ league: LeagueSummary }>("/leagues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
    setCreating(false);
    if (!res.ok) {
      setError(res.error ?? "Could not create league");
      return { ok: false as const, error: res.error ?? "Could not create league" };
    }
    return { ok: true as const, league: res.data?.league };
  }, []);

  return { creating, error, create };
}

export type LeagueDetailView =
  | { state: "loading" }
  | { state: "forbidden"; message: string }
  | { state: "error"; message: string }
  | {
      state: "ready";
      league: LeagueDetail;
      seasons: SeasonSummary[];
      roster: LeagueMember[] | null;
      isCommissioner: boolean;
      isOwner: boolean;
    };

export function useLeagueDetailOrchestration(input: {
  leagueId: number;
  userSub?: string;
}) {
  const { leagueId, userSub } = input;

  const [view, setView] = useState<LeagueDetailView>({ state: "loading" });
  const [working, setWorking] = useState(false);
  const [rosterStatus, setRosterStatus] = useState<ApiResult | null>(null);
  const [transferTarget, setTransferTarget] = useState("");

  const userId = useMemo(() => Number(userSub), [userSub]);

  const refresh = useCallback(async () => {
    if (Number.isNaN(leagueId)) {
      setView({ state: "error", message: "Invalid league id" });
      return;
    }

    setView({ state: "loading" });
    const [detail, seasonRes, rosterRes] = await Promise.all([
      fetchJson<{ league: LeagueDetail }>(`/leagues/${leagueId}`),
      fetchJson<{ seasons: SeasonSummary[] }>(`/leagues/${leagueId}/seasons`),
      fetchJson<{ members: LeagueMember[] }>(`/leagues/${leagueId}/members`)
    ]);

    if (!detail.ok || !detail.data?.league) {
      setView({
        state: detail.errorCode === "FORBIDDEN" ? "forbidden" : "error",
        message: detail.error ?? "Unable to load league"
      });
      return;
    }

    const roster = rosterRes.ok ? (rosterRes.data?.members ?? []) : null;
    const seasons = seasonRes.ok ? (seasonRes.data?.seasons ?? []) : [];

    const isCommissioner =
      Number.isFinite(userId) &&
      !!roster?.some(
        (m) => m.user_id === userId && (m.role === "OWNER" || m.role === "CO_OWNER")
      );
    const isOwner =
      Number.isFinite(userId) &&
      !!roster?.some((m) => m.user_id === userId && m.role === "OWNER");

    setView({
      state: "ready",
      league: detail.data.league,
      seasons,
      roster,
      isCommissioner,
      isOwner
    });
  }, [leagueId, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const copyInvite = useCallback(async () => {
    if (view.state !== "ready") return;
    const origin = window.location.origin;
    const link = `${origin}/leagues/${view.league.id}`;
    const text = `League invite code: ${view.league.code}\nLink: ${link}`;
    await navigator.clipboard?.writeText(text);
    setRosterStatus({ ok: true, message: "Invite copied" });
  }, [view.state === "ready" ? view.league : null]);

  const transferOwnership = useCallback(async () => {
    if (view.state !== "ready") return { ok: false as const };
    if (!transferTarget) return { ok: false as const };
    const targetUserId = Number(transferTarget);
    if (!Number.isFinite(targetUserId)) return { ok: false as const };
    if (!window.confirm("Transfer commissioner role to this member?"))
      return { ok: false as const };

    setWorking(true);
    setRosterStatus(null);
    const res = await fetchJson(`/leagues/${view.league.id}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: targetUserId })
    });
    setWorking(false);
    if (res.ok) {
      setTransferTarget("");
      setRosterStatus({ ok: true, message: "Commissioner role transferred" });
      await refresh();
      return { ok: true as const };
    }
    setRosterStatus({ ok: false, message: res.error ?? "Transfer failed" });
    return { ok: false as const };
  }, [refresh, transferTarget, view]);

  const removeMember = useCallback(
    async (memberUserId: number, role: string) => {
      if (view.state !== "ready") return { ok: false as const };
      if (role === "OWNER") return { ok: false as const };
      if (!window.confirm("Remove this member from the league?"))
        return { ok: false as const };

      setWorking(true);
      setRosterStatus(null);
      const res = await fetchJson(`/leagues/${view.league.id}/members/${memberUserId}`, {
        method: "DELETE"
      });
      setWorking(false);
      if (res.ok) {
        setRosterStatus({ ok: true, message: "Member removed" });
        await refresh();
        return { ok: true as const };
      }
      setRosterStatus({ ok: false, message: res.error ?? "Remove failed" });
      return { ok: false as const };
    },
    [refresh, view]
  );

  return {
    view,
    refresh,
    working,
    rosterStatus,
    transferTarget,
    setTransferTarget,
    copyInvite,
    transferOwnership,
    removeMember
  };
}
