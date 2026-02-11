import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { notify } from "../../notifications";
import type { ApiResult, Snapshot } from "../../lib/types";
import { makeRequestId } from "./helpers";
import { postDraftPause, postDraftPick, postDraftResume, postDraftStart } from "./actions";
import { useDraftSnapshot } from "./useDraftSnapshot";
import { useDraftSocket } from "./useDraftSocket";
import { useDraftClock } from "./useDraftClock";
import { useDraftHeartbeat } from "./useDraftHeartbeat";
import { useDraftAutodraft } from "./useDraftAutodraft";
import {
  buildDraftedSet,
  buildIconByCategoryId,
  buildNominationsByCategoryId,
  buildNominationIconById,
  buildNominationLabelById,
  buildPicksByNumber,
  buildPicksBySeat,
  computeRoundPickLabel,
  computeSeatNumberForPickNumber,
  computeDraftBoardCols,
  computeDraftClockText,
  computePickDisabledReason,
  computeTurn,
  getMaxPicksForSeats,
  type DraftRoomView,
  type PoolMode
} from "../../decisions/draft";
import { computeAutodraftNominationIdOrder } from "../../decisions/draft/autodraftOrder";

export type DraftRoomOrchestration = {
  state: {
    loadingInitial: boolean;
    refreshing: boolean;
    error: string | null;
  };
  nav: {
    backToSeasonHref: string | null;
  };
  header: {
    participants: Array<{
      seatNumber: number;
      label: string;
      active: boolean;
      avatarKey: string | null;
    }>;
    status: Snapshot["draft"]["status"] | null;
    roundNumber: number | null;
    pickNumber: number | null;
    direction: "FORWARD" | "REVERSE" | null;
    hasTimer: boolean;
    clockText: string;
    timerRemainingMs: number | null;
    poolMode: PoolMode;
    setPoolMode: (m: PoolMode) => void;
    view: DraftRoomView;
    setView: (v: DraftRoomView) => void;
    canToggleView: boolean;
    canStartDraft: boolean;
    startDisabled?: boolean;
    startLoading: boolean;
    startResult: ApiResult | null;
    onStartDraft: () => void;
    canManageDraft: boolean;
    pauseLoading: boolean;
    pauseResult: ApiResult | null;
    onPauseDraft: () => void;
    resumeLoading: boolean;
    resumeResult: ApiResult | null;
    onResumeDraft: () => void;
    ceremonyStatus: string | null;
    isFinalResults: boolean;
    resultsWinnerLabel: string | null;
    scoringStrategyName: string;
    getNominationPoints: (nominationId: number) => number;
  };
  layout: {
    phase: "PRE" | "LIVE" | "POST";
    showRosterOnly: boolean;
    boardCols: string;
    rails: {
      ledger: {
        present?: boolean;
        visible?: boolean;
        collapsed: boolean;
        hide: () => void;
        show: () => void;
      };
      myRoster: {
        present?: boolean;
        visible?: boolean;
        collapsed: boolean;
        hide: () => void;
        show: () => void;
      };
      autodraft: {
        present?: boolean;
        visible?: boolean;
        collapsed: boolean;
        hide: () => void;
        show: () => void;
      };
    };
  };
  ledger: {
    rows: Array<{
      pickNumber: number;
      roundPick: string;
      seatNumber: number | null;
      seatLabel: string;
      nominationId: number | null;
      icon: string | null;
      label: string;
      active: boolean;
      winner: boolean;
    }>;
  };
  pool: {
    categories: Array<{
      id: number;
      title: string;
      icon: string;
      iconVariant?: "default" | "inverted";
      unitKind?: string;
      weight?: number | null;
      nominations: Array<{
        id: number;
        label: string;
        posterUrl?: string | null;
        filmTitle?: string | null;
        filmYear?: number | null;
        contributors?: string[];
        songTitle?: string | null;
        performerName?: string | null;
        performerCharacter?: string | null;
        performerProfileUrl?: string | null;
        performerProfilePath?: string | null;
        muted: boolean;
        selected: boolean;
        winner: boolean;
      }>;
      emptyText: string | null;
    }>;
    onSelectNomination: (id: number) => void;
    selectable?: boolean;
  };
  myRoster: {
    seatNumber: number | null;
    picks: Array<{
      pickNumber: number;
      roundPick: string;
      nominationId: number;
      icon: string | null;
      label: string;
      winner: boolean;
    }>;
    selected: { id: number; icon: string | null; label: string } | null;
    clearSelection: () => void;
    canPick: boolean;
    pickDisabledReason: string | null;
    pickLoading: boolean;
    pickState: ApiResult | null;
    submitPick: () => void;
    submitPickNomination: (nominationId: number) => void;
  };
  rosterBoard: {
    seats: Array<{ seatNumber: number; username: string | null; winnerCount: number }>;
    maxRows: number;
    rowsBySeat: Map<
      number,
      Array<{
        pickNumber: number;
        nominationId: number;
        icon: string | null;
        label: string;
        winner: boolean;
      }>
    >;
    emptyText: string | null;
  };
  autodraft: {
    enabled: boolean;
    setEnabled: (v: boolean) => void;
    strategy: "random" | "by_category" | "alphabetical" | "wisdom" | "custom";
    setStrategy: (
      v: "random" | "by_category" | "alphabetical" | "wisdom" | "custom"
    ) => void;
    plans: Array<{ id: number; name: string }>;
    selectedPlanId: number | null;
    setSelectedPlanId: (v: number | null) => void;
    list: Array<{ nominationId: number; icon: string | null; label: string }>;
    loading: boolean;
    saving: boolean;
    error: string | null;
  };
  refresh: () => void;
};

export function useDraftRoomOrchestration(args: {
  initialDraftId?: string | number;
  disabled?: boolean;
}): DraftRoomOrchestration {
  const { initialDraftId, disabled } = args;

  const [draftId] = useState(String(initialDraftId ?? "1"));
  const snapshotState = useDraftSnapshot({ draftId, disabled });
  const loading = snapshotState.loading;
  const error = snapshotState.error;
  const snapshot = snapshotState.snapshot;
  const setSnapshot = snapshotState.setSnapshot;
  const setError = snapshotState.setError;

  const [view, setView] = useState<DraftRoomView>("draft");
  // Default: show all nominees but mute drafted ones (better situational awareness).
  const [poolMode, setPoolMode] = useState<PoolMode>("ALL_MUTED");
  const [ledgerCollapsed, setLedgerCollapsed] = useState(false);
  const [rosterCollapsed, setRosterCollapsed] = useState(false);
  const [autodraftCollapsed, setAutodraftCollapsed] = useState(false);

  const [selectedNominationId, setSelectedNominationId] = useState<number | null>(null);
  const [pickState, setPickState] = useState<ApiResult | null>(null);
  const [pickLoading, setPickLoading] = useState(false);
  const [startState, setStartState] = useState<ApiResult | null>(null);
  const [startLoading, setStartLoading] = useState(false);
  const [pauseState, setPauseState] = useState<ApiResult | null>(null);
  const [pauseLoading, setPauseLoading] = useState(false);
  const [resumeState, setResumeState] = useState<ApiResult | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const nowTs = useDraftClock();

  const socketRef = useRef<Socket | null>(null);
  const snapshotRef = snapshotState.snapshotRef;
  const lastVersionRef = snapshotState.lastVersionRef;
  const lastStatusRef = snapshotState.lastStatusRef;

  const loadSnapshot = snapshotState.loadSnapshot;
  const refresh = snapshotState.refresh;

  const autodraftState = useDraftAutodraft({
    disabled: Boolean(disabled),
    snapshot,
    snapshotRef
  });
  const autoStrategy = autodraftState.strategy;
  const autoPlanId = autodraftState.selectedPlanId;
  const autoList = autodraftState.planNominationIds;

  useDraftHeartbeat({
    disabled,
    draftId: snapshot?.draft?.id ?? null,
    snapshotRef,
    socketRef,
    loadSnapshot
  });

  const drafted = useMemo(
    () => buildDraftedSet(snapshot?.picks ?? []),
    [snapshot?.picks]
  );
  const winnerSet = useMemo(() => {
    const set = new Set<number>();
    for (const w of snapshot?.winners ?? []) set.add(w.nomination_id);
    return set;
  }, [snapshot?.winners]);
  const winnerCountBySeat = useMemo(() => {
    const m = new Map<number, number>();
    if (!snapshot) return m;
    for (const s of snapshot.seats) m.set(s.seat_number, 0);
    for (const p of snapshot.picks) {
      if (!winnerSet.has(p.nomination_id)) continue;
      m.set(p.seat_number, (m.get(p.seat_number) ?? 0) + 1);
    }
    return m;
  }, [snapshot, winnerSet]);
  const nominationLabelById = useMemo(
    () => buildNominationLabelById(snapshot),
    [snapshot]
  );
  const nominationIconById = useMemo(() => buildNominationIconById(snapshot), [snapshot]);
  const iconByCategoryId = useMemo(() => buildIconByCategoryId(snapshot), [snapshot]);
  const nominationsByCategoryId = useMemo(
    () => buildNominationsByCategoryId(snapshot),
    [snapshot]
  );

  const ceremonyStatus = snapshot?.ceremony_status ?? null;
  const scoringStrategyName = snapshot?.scoring_strategy_name ?? "fixed";
  const isFinalResults =
    (snapshot?.draft.status ?? null) === "COMPLETED" && ceremonyStatus === "COMPLETE";

  const categoryWeightByCategoryId = useMemo(() => {
    const m = new Map<number, number>();
    const raw = snapshot?.category_weights;
    if (!raw || typeof raw !== "object") return m;
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const id = Number(k);
      const n = Number(v);
      if (!Number.isFinite(id) || id <= 0) continue;
      if (!Number.isInteger(n) || n < -99 || n > 99) continue;
      m.set(id, n);
    }
    return m;
  }, [snapshot?.category_weights]);

  const pointsForNominationId = useMemo(() => {
    const m = new Map<number, number>();
    if (!snapshot) return m;
    const nominations = snapshot.nominations ?? [];
    for (const n of nominations) {
      const nominationId = Number(n.id);
      const categoryId = Number(n.category_edition_id);
      if (!Number.isFinite(nominationId) || !Number.isFinite(categoryId)) continue;
      if (scoringStrategyName === "category_weighted") {
        m.set(nominationId, categoryWeightByCategoryId.get(categoryId) ?? 1);
      } else {
        m.set(nominationId, 1);
      }
    }
    return m;
  }, [categoryWeightByCategoryId, scoringStrategyName, snapshot]);

  const seatScoreBySeatNumber = useMemo(() => {
    const m = new Map<number, number>();
    if (!snapshot) return m;
    for (const s of snapshot.seats) m.set(s.seat_number, 0);
    for (const p of snapshot.picks) {
      if (!winnerSet.has(p.nomination_id)) continue;
      const delta = pointsForNominationId.get(p.nomination_id) ?? 1;
      m.set(p.seat_number, (m.get(p.seat_number) ?? 0) + delta);
    }
    return m;
  }, [pointsForNominationId, snapshot, winnerSet]);

  const resultsWinnerLabel = useMemo(() => {
    if (!snapshot || !isFinalResults) return null;
    const scores = snapshot.seats.map((s) => ({
      seatNumber: s.seat_number,
      username: s.username ?? `Seat ${s.seat_number}`,
      score:
        scoringStrategyName === "category_weighted"
          ? (seatScoreBySeatNumber.get(s.seat_number) ?? 0)
          : (winnerCountBySeat.get(s.seat_number) ?? 0)
    }));
    if (!scores.length) return null;
    const bestScore =
      scoringStrategyName === "negative"
        ? Math.min(...scores.map((s) => s.score))
        : Math.max(...scores.map((s) => s.score));
    const winners = scores.filter((s) => s.score === bestScore);
    if (!winners.length) return null;
    if (winners.length === 1) return winners[0].username;
    return `Tie: ${winners.map((w) => w.username).join(", ")}`;
  }, [
    isFinalResults,
    scoringStrategyName,
    seatScoreBySeatNumber,
    snapshot,
    winnerCountBySeat
  ]);

  const turn = useMemo(() => (snapshot ? computeTurn(snapshot) : null), [snapshot]);
  const activeSeatNumber = turn?.seat_number ?? null;
  const mySeatNumber = snapshot?.my_seat_number ?? null;

  const autodraftList = useMemo(() => {
    const ids = computeAutodraftNominationIdOrder({
      snapshot,
      strategy: autoStrategy,
      planNominationIds: autoList,
      selectedPlanId: autoPlanId,
      scoringStrategyName,
      categoryWeightByCategoryId
    });

    return ids.map((id) => ({
      nominationId: id,
      icon: nominationIconById.get(id) ?? null,
      label: nominationLabelById.get(id) ?? `#${id}`
    }));
  }, [
    autoList,
    autoPlanId,
    autoStrategy,
    categoryWeightByCategoryId,
    nominationIconById,
    nominationLabelById,
    scoringStrategyName,
    snapshot
  ]);

  const pickDisabledReason = useMemo(
    () =>
      computePickDisabledReason({
        snapshot,
        disabled,
        activeSeatNumber,
        mySeatNumber,
        selectedNominationId,
        drafted
      }),
    [activeSeatNumber, disabled, drafted, mySeatNumber, selectedNominationId, snapshot]
  );

  const canPick = Boolean(snapshot && !pickDisabledReason);

  const submitPickNomination = useCallback(
    async (nominationId: number) => {
      if (!snapshot) return;
      setPickLoading(true);
      setPickState(null);

      const res = await postDraftPick({
        draftId: snapshot.draft.id,
        nominationId,
        requestId: makeRequestId()
      });

      if (res.ok) {
        setPickState(null);
        setSelectedNominationId(null);
        // Do not toast here; the websocket "pick made" event is the single source of truth
        // and will toast for all clients (including the picker).
      } else {
        const message = res.error ?? "Pick failed";
        setPickState({ ok: false, message });
        notify({
          id: "draft.pick.failed",
          severity: "error",
          trigger_type: "user_action",
          scope: "local",
          durability: "ephemeral",
          requires_decision: false,
          message
        });
      }
      setPickLoading(false);
    },
    [snapshot]
  );

  const submitPick = useCallback(async () => {
    if (!selectedNominationId) return;
    await submitPickNomination(selectedNominationId);
  }, [selectedNominationId, submitPickNomination]);

  const startDraft = useCallback(async () => {
    if (!snapshot) return;
    setStartLoading(true);
    setStartState(null);
    const res = await postDraftStart(snapshot.draft.id);
    if (res.ok) {
      setStartState(null);
      notify({
        id: "draft.start.ok",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Draft started"
      });
      await loadSnapshot({ preserveSnapshot: true });
    } else {
      const message = res.error ?? "Failed to start draft";
      setStartState({ ok: false, message });
      notify({
        id: "draft.start.failed",
        severity: "error",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message
      });
    }
    setStartLoading(false);
  }, [loadSnapshot, snapshot]);

  const pauseDraft = useCallback(async () => {
    if (!snapshot) return;
    setPauseLoading(true);
    setPauseState(null);
    const res = await postDraftPause(snapshot.draft.id);
    if (res.ok) {
      setPauseState(null);
      notify({
        id: "draft.pause.ok",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Draft paused"
      });
      await loadSnapshot({ preserveSnapshot: true });
    } else {
      const message = res.error ?? "Failed to pause draft";
      setPauseState({ ok: false, message });
      notify({
        id: "draft.pause.failed",
        severity: "error",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message
      });
    }
    setPauseLoading(false);
  }, [loadSnapshot, snapshot]);

  const resumeDraft = useCallback(async () => {
    if (!snapshot) return;
    setResumeLoading(true);
    setResumeState(null);
    const res = await postDraftResume(snapshot.draft.id);
    if (res.ok) {
      setResumeState(null);
      notify({
        id: "draft.resume.ok",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Draft resumed"
      });
      await loadSnapshot({ preserveSnapshot: true });
    } else {
      const message = res.error ?? "Failed to resume draft";
      setResumeState({ ok: false, message });
      notify({
        id: "draft.resume.failed",
        severity: "error",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message
      });
    }
    setResumeLoading(false);
  }, [loadSnapshot, snapshot]);

  useDraftSocket({
    disabled,
    snapshot,
    socketRef,
    snapshotRef,
    lastVersionRef,
    loadSnapshot,
    setSnapshot,
    setError
  });

  const draftStatus = snapshot?.draft.status ?? null;
  const canManageDraft = Boolean(snapshot?.can_manage_draft);
  const phase: DraftRoomOrchestration["layout"]["phase"] =
    draftStatus === "PENDING" ? "PRE" : draftStatus === "COMPLETED" ? "POST" : "LIVE";
  const isPre = phase === "PRE";
  const isPost = phase === "POST";

  const showRosterOnly = isPost;

  const rails = useMemo(() => {
    const showLedger = !isPre;
    const showRoster = !isPre;
    const showAutodraft = true;
    return {
      showLedger,
      showRoster,
      showAutodraft
    };
  }, [autodraftCollapsed, isPre, ledgerCollapsed, rosterCollapsed]);

  const boardCols = useMemo(
    () =>
      computeDraftBoardCols({
        hasSnapshot: Boolean(snapshot),
        showLedger: rails.showLedger
          ? ledgerCollapsed
            ? "collapsed"
            : "open"
          : "hidden",
        showRoster: rails.showRoster
          ? rosterCollapsed
            ? "collapsed"
            : "open"
          : "hidden",
        showAutodraft: rails.showAutodraft
          ? autodraftCollapsed
            ? "collapsed"
            : "open"
          : "hidden"
      }),
    [
      autodraftCollapsed,
      ledgerCollapsed,
      rails.showAutodraft,
      rails.showLedger,
      rails.showRoster,
      rosterCollapsed,
      snapshot
    ]
  );

  const picksByNumber = useMemo(
    () => (snapshot ? buildPicksByNumber(snapshot) : null),
    [snapshot]
  );

  const ledgerRows = useMemo(() => {
    if (!snapshot || !picksByNumber) return [];
    const total = snapshot.total_picks ?? 0;
    const activePick =
      turn?.current_pick_number ?? snapshot.draft.current_pick_number ?? null;
    const seatCount = snapshot.seats.length;
    const seatLabelByNumber = new Map(
      snapshot.seats.map((s) => [s.seat_number, s.username ?? `Seat ${s.seat_number}`])
    );
    const rows: Array<{
      pickNumber: number;
      roundPick: string;
      seatNumber: number | null;
      seatLabel: string;
      nominationId: number | null;
      icon: string | null;
      label: string;
      active: boolean;
      winner: boolean;
    }> = [];

    for (let idx = 0; idx < total; idx++) {
      const pickNumber = idx + 1;
      const pick = picksByNumber.get(pickNumber) ?? null;
      const seatNumber =
        pick?.seat_number ??
        computeSeatNumberForPickNumber({ pickNumber, seatCount }) ??
        null;
      const seatLabel = seatNumber ? (seatLabelByNumber.get(seatNumber) ?? "—") : "—";
      const label = pick
        ? (nominationLabelById.get(pick.nomination_id) ?? `#${pick.nomination_id}`)
        : "—";
      const icon = pick ? (nominationIconById.get(pick.nomination_id) ?? null) : null;
      rows.push({
        pickNumber,
        roundPick: computeRoundPickLabel({ pickNumber, seatCount }),
        seatNumber,
        seatLabel,
        nominationId: pick?.nomination_id ?? null,
        icon,
        label,
        active: activePick === pickNumber,
        winner: Boolean(pick?.nomination_id && winnerSet.has(pick.nomination_id))
      });
    }
    return rows;
  }, [
    nominationIconById,
    nominationLabelById,
    picksByNumber,
    snapshot,
    turn?.current_pick_number,
    winnerSet
  ]);

  const poolCategories = useMemo(() => {
    if (!snapshot) return [];
    const categories = snapshot.categories ?? [];

    return categories.map((c) => {
      const rows = nominationsByCategoryId.get(c.id) ?? [];
      const active = rows.filter((n) => n.status === "ACTIVE");
      const filtered =
        poolMode === "UNDRAFTED_ONLY" ? active.filter((n) => !drafted.has(n.id)) : active;
      const icon = iconByCategoryId.get(c.id) ?? "";
      const nominations = filtered.map((n) => {
        const isDrafted = drafted.has(n.id);
        return {
          id: n.id,
          label: n.label,
          posterUrl: (n as { film_poster_url?: string | null }).film_poster_url ?? null,
          filmTitle: (n as { film_title?: string | null }).film_title ?? null,
          filmYear: (n as { film_year?: number | null }).film_year ?? null,
          contributors: (n as { contributors?: string[] }).contributors ?? [],
          songTitle: (n as { song_title?: string | null }).song_title ?? null,
          performerName: (n as { performer_name?: string | null }).performer_name ?? null,
          performerCharacter:
            (n as { performer_character?: string | null }).performer_character ?? null,
          performerProfileUrl:
            (n as { performer_profile_url?: string | null }).performer_profile_url ??
            null,
          performerProfilePath:
            (n as { performer_profile_path?: string | null }).performer_profile_path ??
            null,
          muted: poolMode === "ALL_MUTED" && isDrafted,
          selected: selectedNominationId === n.id,
          winner: winnerSet.has(n.id)
        };
      });
      return {
        id: c.id,
        title: c.family_name,
        icon,
        iconVariant: (c.icon_variant ?? "default") as "default" | "inverted",
        unitKind: String(c.unit_kind ?? ""),
        weight:
          scoringStrategyName === "category_weighted"
            ? (categoryWeightByCategoryId.get(c.id) ?? 1)
            : null,
        nominations,
        emptyText: nominations.length ? null : "No nominees."
      };
    });
  }, [
    drafted,
    categoryWeightByCategoryId,
    iconByCategoryId,
    nominationsByCategoryId,
    poolMode,
    selectedNominationId,
    scoringStrategyName,
    snapshot,
    winnerSet
  ]);

  const myPicks = useMemo(() => {
    if (!snapshot || !mySeatNumber) return [];
    const seatCount = snapshot.seats.length;
    return snapshot.picks
      .filter((p) => p.seat_number === mySeatNumber)
      .sort((a, b) => a.pick_number - b.pick_number)
      .map((p) => ({
        pickNumber: p.pick_number,
        roundPick: computeRoundPickLabel({ pickNumber: p.pick_number, seatCount }),
        nominationId: p.nomination_id,
        icon: nominationIconById.get(p.nomination_id) ?? null,
        label: nominationLabelById.get(p.nomination_id) ?? `#${p.nomination_id}`,
        winner: winnerSet.has(p.nomination_id)
      }));
  }, [mySeatNumber, nominationIconById, nominationLabelById, snapshot, winnerSet]);

  const selected = useMemo(() => {
    if (!selectedNominationId) return null;
    return {
      id: selectedNominationId,
      icon: nominationIconById.get(selectedNominationId) ?? null,
      label: nominationLabelById.get(selectedNominationId) ?? `#${selectedNominationId}`
    };
  }, [nominationIconById, nominationLabelById, selectedNominationId]);

  const rosterPicksBySeat = useMemo(() => {
    if (!snapshot) return new Map();
    const picksBySeat = buildPicksBySeat(snapshot);
    const out = new Map<
      number,
      Array<{
        pickNumber: number;
        nominationId: number;
        icon: string | null;
        label: string;
      }>
    >();
    for (const seat of snapshot.seats) {
      out.set(
        seat.seat_number,
        (picksBySeat.get(seat.seat_number) ?? []).map((p) => ({
          pickNumber: p.pick_number,
          nominationId: p.nomination_id,
          icon: nominationIconById.get(p.nomination_id) ?? null,
          label: nominationLabelById.get(p.nomination_id) ?? `#${p.nomination_id}`,
          winner: winnerSet.has(p.nomination_id)
        }))
      );
    }
    return out;
  }, [nominationIconById, nominationLabelById, snapshot, winnerSet]);

  const maxRows = useMemo(() => {
    if (!snapshot) return 0;
    const raw = buildPicksBySeat(snapshot);
    return getMaxPicksForSeats(snapshot.seats, raw);
  }, [snapshot]);

  const clockText = snapshot ? computeDraftClockText(snapshot, nowTs) : "—";
  const timerRemainingMs = useMemo(() => {
    if (!snapshot) return null;
    const d = snapshot.draft;
    if (d.status !== "IN_PROGRESS") return null;
    if (!d.pick_timer_seconds) return null;
    if (!d.pick_deadline_at) return null;
    const deadlineMs = new Date(d.pick_deadline_at).getTime();
    if (!Number.isFinite(deadlineMs)) return null;
    const remaining = deadlineMs - nowTs;
    if (!Number.isFinite(remaining)) return null;
    return remaining > 0 ? remaining : 0;
  }, [nowTs, snapshot]);

  const participants = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.seats.map((s) => ({
      seatNumber: s.seat_number,
      label: s.username ?? `Seat ${s.seat_number}`,
      active: turn?.seat_number === s.seat_number,
      avatarKey: s.avatar_key ?? null
    }));
  }, [snapshot, turn?.seat_number]);

  const backToSeasonHref = snapshot ? `/seasons/${snapshot.draft.season_id}` : null;

  // Switching between Draft/Roster is purely presentational and should not depend on live status.
  // This keeps the UI consistent across PRE/IN_PROGRESS/POST states without affecting the websocket.
  const canToggleView =
    Boolean(snapshot) && draftStatus !== "PENDING" && draftStatus !== "COMPLETED";
  const canStartDraft = draftStatus === "PENDING";

  // When the draft completes (including via auto-pick), move to roster view with a toast.
  useEffect(() => {
    if (!snapshot) return;
    const prev = lastStatusRef.current;
    const next = snapshot.draft.status ?? null;
    if (prev && prev !== "COMPLETED" && next === "COMPLETED") {
      notify({
        id: "draft.completed.transition",
        severity: "info",
        trigger_type: "async",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Draft complete! Moving to roster view."
      });
      setView("roster");
    }
    lastStatusRef.current = next;
  }, [snapshot, setView]);

  return {
    state: {
      loadingInitial: Boolean(loading && !snapshot),
      refreshing: Boolean(loading && snapshot),
      error
    },
    nav: { backToSeasonHref },
    header: {
      participants:
        draftStatus === "PENDING"
          ? [...participants].sort((a, b) => a.label.localeCompare(b.label))
          : participants,
      status: draftStatus,
      roundNumber: turn?.round_number ?? null,
      pickNumber:
        turn?.current_pick_number ?? snapshot?.draft.current_pick_number ?? null,
      direction: turn?.direction ?? null,
      hasTimer: Boolean(snapshot?.draft.pick_timer_seconds),
      clockText,
      timerRemainingMs,
      poolMode,
      setPoolMode,
      view,
      setView,
      canToggleView,
      canStartDraft,
      startLoading,
      startResult: startState,
      onStartDraft: () => void startDraft(),
      canManageDraft,
      pauseLoading,
      pauseResult: pauseState,
      onPauseDraft: () => void pauseDraft(),
      resumeLoading,
      resumeResult: resumeState,
      onResumeDraft: () => void resumeDraft(),
      ceremonyStatus,
      isFinalResults,
      resultsWinnerLabel,
      scoringStrategyName,
      getNominationPoints: (nominationId: number) =>
        pointsForNominationId.get(nominationId) ?? 1
    },
    layout: {
      phase,
      showRosterOnly,
      boardCols,
      rails: {
        ledger: {
          present: !isPre,
          collapsed: ledgerCollapsed,
          hide: () => setLedgerCollapsed(true),
          show: () => setLedgerCollapsed(false)
        },
        myRoster: {
          present: !isPre,
          collapsed: rosterCollapsed,
          hide: () => setRosterCollapsed(true),
          show: () => setRosterCollapsed(false)
        },
        autodraft: {
          present: true,
          collapsed: autodraftCollapsed,
          hide: () => setAutodraftCollapsed(true),
          show: () => setAutodraftCollapsed(false)
        }
      }
    },
    ledger: { rows: ledgerRows },
    pool: {
      categories: poolCategories,
      onSelectNomination: (id) => setSelectedNominationId(id)
    },
    myRoster: {
      seatNumber: mySeatNumber,
      picks: myPicks,
      selected,
      clearSelection: () => setSelectedNominationId(null),
      canPick,
      pickDisabledReason,
      pickLoading,
      pickState,
      submitPick: () => void submitPick(),
      submitPickNomination: (nominationId) => void submitPickNomination(nominationId)
    },
    rosterBoard: {
      seats: (() => {
        const base =
          snapshot?.seats.map((s) => ({
            seatNumber: s.seat_number,
            username: s.username ?? null,
            winnerCount: winnerCountBySeat.get(s.seat_number) ?? 0,
            score: seatScoreBySeatNumber.get(s.seat_number) ?? 0
          })) ?? [];
        if (!snapshot || !isFinalResults) return base;
        const dir = scoringStrategyName === "negative" ? 1 : -1; // negative: fewer winners wins; others: higher score wins
        return [...base].sort((a, b) => {
          const aScore =
            scoringStrategyName === "category_weighted" ? a.score : a.winnerCount;
          const bScore =
            scoringStrategyName === "category_weighted" ? b.score : b.winnerCount;
          if (aScore !== bScore) return (aScore - bScore) * dir;
          return a.seatNumber - b.seatNumber;
        });
      })(),
      maxRows,
      rowsBySeat: rosterPicksBySeat,
      emptyText:
        snapshot && snapshot.seats.length === 0
          ? "Roster view is available once the draft starts."
          : null
    },
    autodraft: {
      enabled: autodraftState.enabled,
      setEnabled: autodraftState.setEnabled,
      strategy: autodraftState.strategy,
      setStrategy: autodraftState.setStrategy,
      plans: autodraftState.plans,
      selectedPlanId: autodraftState.selectedPlanId,
      setSelectedPlanId: autodraftState.setSelectedPlanId,
      list: autodraftList,
      loading: autodraftState.loading,
      saving: autodraftState.saving,
      error: autodraftState.error
    },
    refresh
  };
}
