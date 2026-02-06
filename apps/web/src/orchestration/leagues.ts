import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../lib/api";
import { notify } from "../notifications";
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

  const transferOwnershipTo = useCallback(async (targetUserId: number) => {
    if (view.state !== "ready") return { ok: false as const };
    if (!Number.isFinite(targetUserId)) return { ok: false as const };
    setWorking(true);
    setRosterStatus(null);
    const res = await fetchJson(`/leagues/${view.league.id}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: targetUserId })
    });
    setWorking(false);
    if (res.ok) {
      notify({
        id: "league.commissioner.transfer.success",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Commissioner role transferred"
      });
      setRosterStatus(null);
      await refresh();
      return { ok: true as const };
    }
    setRosterStatus({ ok: false, message: res.error ?? "Transfer failed" });
    return { ok: false as const };
  }, [refresh, view]);

  const deleteLeague = useCallback(async () => {
    if (view.state !== "ready") return { ok: false as const };
    setWorking(true);
    setRosterStatus(null);
    const res = await fetchJson(`/leagues/${view.league.id}`, { method: "DELETE" });
    setWorking(false);
    if (!res.ok) {
      setRosterStatus({ ok: false, message: res.error ?? "Delete failed" });
      return { ok: false as const };
    }
    notify({
      id: "league.delete.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "League deleted"
    });
    return { ok: true as const };
  }, [view]);

  return {
    view,
    refresh,
    working,
    rosterStatus,
    transferOwnershipTo,
    deleteLeague
  };
}
