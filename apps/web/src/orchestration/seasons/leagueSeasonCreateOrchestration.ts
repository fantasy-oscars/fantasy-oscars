import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../query/keys";
import {
  circuitsListQuery,
  leagueCircuitsQuery,
  leagueMembersQuery
} from "../query/queries";
import { fetchJson } from "../../lib/api";
import { notify } from "../../notifications";
import type {
  ApiResult,
  CeremonySummary,
  CircuitLeagueDetail,
  CircuitLeagueSummary,
  CircuitSummary,
  FieldErrors,
  LeagueDetail
} from "../../lib/types";
import { startableCircuits } from "../../decisions/circuitLeague";
import {
  NOT_COMMISSIONER_MESSAGE,
  canCreateSeasons,
  ceremonyKindAvailability,
  fullKindAvailability,
  visibleSeasonKinds,
  type SeasonKind,
  type SeasonKindAvailability
} from "../../decisions/seasonKinds";
import {
  fullSeasonDefaults,
  fullSeasonWrites,
  hasCustomEventsOrCategories,
  withDefaultEventsAndCategories,
  type FullSeasonSettings,
  type SettingsArea,
  type SettingsCategory,
  type SettingsEvent
} from "../../decisions/fullSeasonSettings";
import { useFieldErrors } from "../useFieldErrors";

/** The chosen awards season's events and categories, for the settings modals. */
export type FullSeasonOptions =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; events: SettingsEvent[]; categories: SettingsCategory[] };

const NO_OPTIONS = {
  events: [] as SettingsEvent[],
  categories: [] as SettingsCategory[]
};

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
      /** Which kinds of season can be created here, and why not. */
      kinds: Record<SeasonKind, SeasonKindAvailability>;
      /** The kinds offered, in display order. */
      kindOrder: readonly SeasonKind[];
      /** True while a failed check for open awards seasons is being retried. */
      checkingFull: boolean;
      /** Active Circuits not yet running in this league, in API order. */
      openCircuits: CircuitSummary[];
      fullCircuitId: number | null;
      fullWorking: boolean;
      fullStatus: ApiResult | null;
      /** The settings the commissioner applied; the defaults until they edit. */
      fullSettings: FullSeasonSettings;
      fullOptions: FullSeasonOptions;
      /** Changing the awards season put edited events and categories back. */
      fullDiscarded: boolean;
    };

export function useLeagueSeasonCreateOrchestration(input: {
  leagueId: number;
  /** The signed-in viewer; only the league's commissioners may create. */
  userSub?: string;
  /** Full awards seasons are gated; only a super admin is offered them. */
  fullSeasonEnabled?: boolean;
}) {
  const { leagueId, userSub, fullSeasonEnabled = false } = input;

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
  // `null` means the list failed to load.
  const [circuits, setCircuits] = useState<CircuitSummary[] | null>([]);
  const [started, setStarted] = useState<CircuitLeagueSummary[] | null>([]);
  const [checkingFull, setCheckingFull] = useState(false);
  const [fullCircuitId, setFullCircuitIdState] = useState<number | null>(null);
  const [fullWorking, setFullWorking] = useState(false);
  const [fullStatus, setFullStatus] = useState<ApiResult | null>(null);
  const [fullSettings, setFullSettings] = useState<FullSeasonSettings>(() =>
    fullSeasonDefaults([], [])
  );
  const [fullOptionsFor, setFullOptionsFor] = useState<{
    circuitId: number;
    options: FullSeasonOptions;
  } | null>(null);
  const [fullOptionsAttempt, setFullOptionsAttempt] = useState(0);
  const [fullDiscarded, setFullDiscarded] = useState(false);

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

  const loadFullOptions = useCallback(async () => {
    if (!fullSeasonEnabled) return;
    const [circuitList, startedList] = await Promise.all([
      queryClient.fetchQuery(circuitsListQuery()).catch(() => null),
      queryClient.fetchQuery(leagueCircuitsQuery(leagueId)).catch(() => null)
    ]);
    setCircuits(circuitList);
    setStarted(startedList);
  }, [fullSeasonEnabled, leagueId, queryClient]);

  const retryFull = useCallback(async () => {
    setCheckingFull(true);
    await loadFullOptions();
    setCheckingFull(false);
  }, [loadFullOptions]);

  const refresh = useCallback(async () => {
    if (!Number.isFinite(leagueId) || leagueId <= 0) {
      setState("error");
      setError("Invalid league id");
      return;
    }

    setState("loading");
    setError(null);

    const [leagueRes, ceremoniesRes, , members] = await Promise.all([
      fetchJson<{ league: LeagueDetail }>(`/leagues/${leagueId}`, { method: "GET" }),
      fetchJson<{ ceremonies: CeremonySummary[] }>(`/ceremonies/published`, {
        method: "GET"
      }),
      loadFullOptions(),
      queryClient.fetchQuery(leagueMembersQuery(leagueId)).catch(() => null)
    ]);

    if (!leagueRes.ok || !leagueRes.data?.league) {
      setError(leagueRes.error ?? "Unable to load league");
      setState(leagueRes.errorCode === "FORBIDDEN" ? "forbidden" : "error");
      return;
    }

    if (!canCreateSeasons(members, Number(userSub))) {
      setError(NOT_COMMISSIONER_MESSAGE);
      setState("forbidden");
      return;
    }

    setLeague(leagueRes.data.league);
    setCeremonies(ceremoniesRes.ok ? (ceremoniesRes.data?.ceremonies ?? []) : []);
    setState("ready");
  }, [leagueId, loadFullOptions, queryClient, userSub]);

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

  const openCircuits = useMemo(
    () => (circuits && started ? startableCircuits(circuits, started) : []),
    [circuits, started]
  );
  // The chosen awards season, or the first open one until the commissioner picks.
  const selectedCircuitId = openCircuits.some((c) => c.id === fullCircuitId)
    ? fullCircuitId
    : (openCircuits[0]?.id ?? null);

  // Load the chosen awards season's events and categories. Their values start
  // at the defaults; roster, points and draft settings carry over.
  useEffect(() => {
    if (!selectedCircuitId) return;
    let cancelled = false;
    setFullOptionsFor({ circuitId: selectedCircuitId, options: { state: "loading" } });
    void Promise.all([
      fetchJson<{ events: SettingsEvent[] }>(`/circuits/${selectedCircuitId}/events`, {
        method: "GET"
      }),
      fetchJson<{ categories: SettingsCategory[] }>(
        `/circuits/${selectedCircuitId}/categories`,
        { method: "GET" }
      )
    ]).then(([eventsRes, categoriesRes]) => {
      if (cancelled) return;
      if (!eventsRes.ok || !categoriesRes.ok) {
        setFullOptionsFor({ circuitId: selectedCircuitId, options: { state: "error" } });
        return;
      }
      const events = eventsRes.data?.events ?? [];
      const categories = categoriesRes.data?.categories ?? [];
      setFullSettings((prev) => withDefaultEventsAndCategories(prev, events, categories));
      setFullOptionsFor({
        circuitId: selectedCircuitId,
        options: { state: "ready", events, categories }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedCircuitId, fullOptionsAttempt]);

  const fullOptions: FullSeasonOptions =
    fullOptionsFor && fullOptionsFor.circuitId === selectedCircuitId
      ? fullOptionsFor.options
      : { state: "loading" };
  const loadedOptions = fullOptions.state === "ready" ? fullOptions : NO_OPTIONS;

  const retryFullOptions = useCallback(() => setFullOptionsAttempt((n) => n + 1), []);

  const setFullCircuitId = useCallback(
    (v: number | null) => {
      setFullStatus(null);
      if (v !== selectedCircuitId) {
        setFullDiscarded(hasCustomEventsOrCategories(fullSettings));
        setFullSettings((prev) => withDefaultEventsAndCategories(prev, [], []));
      }
      setFullCircuitIdState(v);
    },
    [selectedCircuitId, fullSettings]
  );

  const applyFullArea = useCallback((_area: SettingsArea, next: FullSeasonSettings) => {
    setFullStatus(null);
    setFullSettings(next);
    return { ok: true as const };
  }, []);

  const submitFull = useCallback(async () => {
    if (!Number.isFinite(leagueId) || leagueId <= 0) return { ok: false as const };
    if (!selectedCircuitId) return { ok: false as const };

    setFullWorking(true);
    setFullStatus(null);
    // Only what differs from the defaults goes with the create request.
    const writes = fullSeasonWrites(
      fullSeasonDefaults(loadedOptions.events, loadedOptions.categories),
      fullSettings,
      loadedOptions.events,
      loadedOptions.categories
    );
    const res = await fetchJson<CircuitLeagueDetail>(`/leagues/${leagueId}/circuits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        circuit_id: selectedCircuitId,
        ...(writes.settings ? { settings: writes.settings } : {}),
        ...(writes.events ? { events: writes.events } : {}),
        ...(writes.categories ? { categories: writes.categories } : {})
      })
    });
    setFullWorking(false);

    if (!res.ok || !res.data) {
      setFullStatus({
        ok: false,
        message: res.error ?? "Could not create the season",
        requestId: res.requestId
      });
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
    const detail = res.data;
    queryClient.setQueryData(
      queryKeys.circuitLeagues.detail(detail.circuit_league.id),
      detail
    );
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.leagues.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.seasons.all })
    ]);
    return { ok: true as const, fullSeasonId: detail.circuit_league.id };
  }, [leagueId, queryClient, selectedCircuitId, fullSettings, loadedOptions]);

  /** The default awards season and every area at its defaults, without asking. */
  const resetFull = useCallback(() => {
    const first = openCircuits[0]?.id ?? null;
    setFullCircuitIdState(null);
    setFullStatus(null);
    setFullDiscarded(false);
    setFullSettings(
      first === selectedCircuitId
        ? fullSeasonDefaults(loadedOptions.events, loadedOptions.categories)
        : fullSeasonDefaults([], [])
    );
  }, [openCircuits, selectedCircuitId, loadedOptions]);

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
              canSubmit,
              kindOrder: visibleSeasonKinds(fullSeasonEnabled),
              kinds: {
                ceremony: ceremonyKindAvailability(ceremonies.length),
                full: fullKindAvailability({ circuits, started })
              },
              checkingFull,
              openCircuits,
              fullCircuitId: selectedCircuitId,
              fullWorking,
              fullStatus,
              fullSettings,
              fullOptions,
              fullDiscarded
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
      submit,
      retryFull,
      setFullCircuitId,
      resetFull,
      submitFull,
      retryFullOptions,
      applyFullArea
    }
  };
}
