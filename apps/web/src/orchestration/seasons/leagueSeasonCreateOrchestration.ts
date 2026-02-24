import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../../lib/api";
import { notify } from "../../notifications";
import type { ApiResult, CeremonySummary, LeagueDetail } from "../../lib/types";

export type LeagueSeasonCreateView =
  | { state: "loading" }
  | { state: "forbidden"; message: string }
  | { state: "error"; message: string }
  | {
      state: "ready";
      league: LeagueDetail;
      ceremonies: CeremonySummary[];
      working: boolean;
      status: ApiResult | null;
      ceremonyId: number | null;
      scoringStrategy: "fixed" | "negative" | "category_weighted";
      remainderStrategy: "UNDRAFTED" | "FULL_POOL";
      timerEnabled: boolean;
      pickTimerSeconds: number;
      canSubmit: boolean;
    };

export function useLeagueSeasonCreateOrchestration(input: { leagueId: number }) {
  const { leagueId } = input;

  const [state, setState] = useState<"loading" | "error" | "ready" | "forbidden">(
    "loading"
  );
  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [ceremonies, setCeremonies] = useState<CeremonySummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<ApiResult | null>(null);

  const [ceremonyId, setCeremonyId] = useState<number | null>(null);
  const [scoringStrategy, setScoringStrategy] = useState<
    "fixed" | "negative" | "category_weighted"
  >("fixed");
  const [remainderStrategy, setRemainderStrategy] = useState<"UNDRAFTED" | "FULL_POOL">(
    "UNDRAFTED"
  );
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [pickTimerSeconds, setPickTimerSeconds] = useState(60);

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

    if (!leagueRes.ok || !leagueRes.data?.league) {
      setError(leagueRes.error ?? "Unable to load league");
      setState(leagueRes.errorCode === "FORBIDDEN" ? "forbidden" : "error");
      return;
    }

    setLeague(leagueRes.data.league);
    setCeremonies(ceremoniesRes.ok ? (ceremoniesRes.data?.ceremonies ?? []) : []);
    setState("ready");
  }, [leagueId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const canSubmit = useMemo(() => {
    return (
      state === "ready" &&
      !working &&
      Number.isFinite(ceremonyId) &&
      (ceremonyId ?? 0) > 0
    );
  }, [ceremonyId, state, working]);

  const submit = useCallback(async () => {
    if (!Number.isFinite(leagueId) || leagueId <= 0) return { ok: false as const };
    if (!ceremonyId) return { ok: false as const };
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
          scoring_strategy_name: scoringStrategy,
          remainder_strategy: remainderStrategy,
          pick_timer_seconds: timerEnabled ? pickTimerSeconds : null
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

    notify({
      id: "season.create.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Season created"
    });
    setStatus(null);
    return { ok: true as const, seasonId };
  }, [
    ceremonyId,
    leagueId,
    pickTimerSeconds,
    remainderStrategy,
    scoringStrategy,
    timerEnabled
  ]);

  const reset = useCallback(() => {
    setCeremonyId(null);
    setScoringStrategy("fixed");
    setRemainderStrategy("UNDRAFTED");
    setTimerEnabled(true);
    setPickTimerSeconds(60);
    setStatus(null);
  }, []);

  const view: LeagueSeasonCreateView =
    state === "loading"
      ? { state: "loading" }
      : state === "forbidden"
        ? { state: "forbidden", message: error ?? "Access denied" }
        : state === "error"
          ? { state: "error", message: error ?? "Unexpected error" }
          : {
              state: "ready",
              league: league ?? ({ id: leagueId, name: "", code: "" } as LeagueDetail),
              ceremonies,
              working,
              status,
              ceremonyId,
              scoringStrategy,
              remainderStrategy,
              timerEnabled,
              pickTimerSeconds,
              canSubmit
            };

  return {
    view,
    actions: {
      refresh,
      setCeremonyId,
      setScoringStrategy,
      setRemainderStrategy,
      setTimerEnabled,
      setPickTimerSeconds,
      reset,
      submit
    }
  };
}
