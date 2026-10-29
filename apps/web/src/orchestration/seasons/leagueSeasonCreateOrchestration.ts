import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../query/keys";
import { fetchJson } from "../../lib/api";
import { notify } from "../../notifications";
import type {
  ApiResult,
  CeremonySummary,
  FieldErrors,
  LeagueDetail
} from "../../lib/types";
import { useFieldErrors } from "../useFieldErrors";

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
      fieldErrors: FieldErrors;
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

  const queryClient = useQueryClient();
  const {
    errors: fieldErrors,
    applyFailure,
    clear,
    reset: resetFieldErrors
  } = useFieldErrors();
  const [ceremonyId, setCeremonyIdState] = useState<number | null>(null);
  const [scoringStrategy, setScoringStrategyState] = useState<
    "fixed" | "negative" | "category_weighted"
  >("fixed");
  const [remainderStrategy, setRemainderStrategyState] = useState<
    "UNDRAFTED" | "FULL_POOL"
  >("UNDRAFTED");
  const [timerEnabled, setTimerEnabledState] = useState(true);
  const [pickTimerSeconds, setPickTimerSecondsState] = useState(60);

  // Editing an input clears the server's message for it.
  const setCeremonyId = useCallback(
    (v: number | null) => {
      clear("ceremony_id");
      setCeremonyIdState(v);
    },
    [clear]
  );
  const setScoringStrategy = useCallback(
    (v: "fixed" | "negative" | "category_weighted") => {
      clear("scoring_strategy_name");
      setScoringStrategyState(v);
    },
    [clear]
  );
  const setRemainderStrategy = useCallback(
    (v: "UNDRAFTED" | "FULL_POOL") => {
      clear("remainder_strategy");
      setRemainderStrategyState(v);
    },
    [clear]
  );
  const setTimerEnabled = useCallback(
    (v: boolean) => {
      clear("pick_timer_seconds");
      setTimerEnabledState(v);
    },
    [clear]
  );
  const setPickTimerSeconds = useCallback(
    (v: number) => {
      clear("pick_timer_seconds");
      setPickTimerSecondsState(v);
    },
    [clear]
  );

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
    resetFieldErrors();
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
      applyFailure(res);
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
    // The new season must show up in league/season lists before we navigate to it.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.leagues.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.seasons.all })
    ]);
    return { ok: true as const, seasonId };
  }, [
    queryClient,
    applyFailure,
    resetFieldErrors,
    ceremonyId,
    leagueId,
    pickTimerSeconds,
    remainderStrategy,
    scoringStrategy,
    timerEnabled
  ]);

  const reset = useCallback(() => {
    setCeremonyIdState(null);
    setScoringStrategyState("fixed");
    setRemainderStrategyState("UNDRAFTED");
    setTimerEnabledState(true);
    setPickTimerSecondsState(60);
    setStatus(null);
    resetFieldErrors();
  }, [resetFieldErrors]);

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
              fieldErrors,
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
