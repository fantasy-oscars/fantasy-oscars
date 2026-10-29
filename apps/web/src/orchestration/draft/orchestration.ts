import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateCeremonyAndDraftData } from "../query/invalidate";
import type { Socket } from "socket.io-client";
import { notify } from "../../notifications";
import { useDraftSnapshot } from "./useDraftSnapshot";
import { useDraftSocket } from "./useDraftSocket";
import { useDraftClock } from "./useDraftClock";
import { useDraftHeartbeat } from "./useDraftHeartbeat";
import { useDraftAutodraft } from "./useDraftAutodraft";
import { useDraftRoomActions } from "./useDraftRoomActions";
import { useDraftCursorSpy } from "./useDraftCursorSpy";
import { useDraftDerivedData } from "./useDraftDerivedData";
import { useDraftBoards } from "./useDraftBoards";
import type { DraftRoomOrchestration } from "./types";
import {
  computeDraftBoardCols,
  computeDraftClockText,
  computePickDisabledReason,
  computeTurn,
  type DraftRoomView,
  type PoolMode
} from "../../decisions/draft";
import { computeAutodraftNominationIdOrder } from "../../decisions/draft/autodraftOrder";
import {
  buildRosterBoardSeats,
  computeTimerRemainingMs
} from "../../decisions/draft/scoring";

export type { DraftRoomOrchestration } from "./types";

export function useDraftRoomOrchestration(args: {
  initialDraftId?: string | number;
  disabled?: boolean;
  disableCursorSpy?: boolean;
}): DraftRoomOrchestration {
  const { initialDraftId, disabled } = args;

  const [draftId] = useState(String(initialDraftId ?? "1"));
  const queryClient = useQueryClient();

  // Leaving the draft room: whatever happened inside it may have changed the
  // season/league/ceremony pages the user lands on next.
  useEffect(() => {
    return () => {
      void invalidateCeremonyAndDraftData(queryClient);
    };
  }, [queryClient]);
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

  const derived = useDraftDerivedData(snapshot);
  const {
    drafted,
    winnerCountBySeat,
    nominationLabelById,
    nominationIconById,
    ceremonyStatus,
    scoringStrategyName,
    isFinalResults,
    categoryWeightByCategoryId,
    pointsForNominationId,
    seatScoreBySeatNumber,
    resultsPodium,
    resultsWinnerLabel
  } = derived;

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
      label: nominationLabelById.get(id) ?? "Unnamed nomination"
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

  const actions = useDraftRoomActions({
    snapshot,
    selectedNominationId,
    setSelectedNominationId,
    loadSnapshot
  });

  const draftStatus = snapshot?.draft.status ?? null;
  const { upsertRemoteCursor, ...cursorSpy } = useDraftCursorSpy({
    snapshot,
    socketRef,
    disableCursorSpy: args.disableCursorSpy
  });

  useDraftSocket({
    disabled,
    snapshot,
    socketRef,
    snapshotRef,
    lastVersionRef,
    loadSnapshot,
    setSnapshot,
    setError,
    onRemoteCursor: upsertRemoteCursor
  });

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

  const {
    ledgerRows,
    poolCategories,
    myPicks,
    selected,
    rosterPicksBySeat,
    maxRows,
    participants
  } = useDraftBoards({ snapshot, turn, mySeatNumber, selectedNominationId, derived });

  const clockText = snapshot ? computeDraftClockText(snapshot, nowTs) : "—";
  const timerRemainingMs = useMemo(
    () => computeTimerRemainingMs(snapshot, nowTs),
    [nowTs, snapshot]
  );

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
      ...actions.header,
      canManageDraft,
      ceremonyStatus,
      isFinalResults,
      resultsWinnerLabel,
      resultsPodium,
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
      ...actions.myRoster
    },
    rosterBoard: {
      seats: buildRosterBoardSeats({
        snapshot,
        isFinalResults,
        scoringStrategyName,
        winnerCountBySeat,
        seatScoreBySeatNumber
      }),
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
    cursorSpy,
    refresh
  };
}
