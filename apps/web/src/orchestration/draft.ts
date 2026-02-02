import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { fetchJson } from "../lib/api";
import type { ApiResult, DraftEventMessage, Snapshot } from "../lib/types";
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
} from "../decisions/draft";

type Env = { VITE_API_BASE?: string };
const API_BASE = (
  (import.meta as unknown as { env: Env }).env.VITE_API_BASE ?? ""
).trim();

function makeRequestId(): string {
  return (
    crypto?.randomUUID?.() ??
    `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

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
    participants: Array<{ seatNumber: number; label: string; active: boolean }>;
    status: Snapshot["draft"]["status"] | null;
    roundNumber: number | null;
    pickNumber: number | null;
    clockText: string;
    poolMode: PoolMode;
    setPoolMode: (m: PoolMode) => void;
    view: DraftRoomView;
    setView: (v: DraftRoomView) => void;
    canToggleView: boolean;
    canStartDraft: boolean;
    startLoading: boolean;
    startResult: ApiResult | null;
    onStartDraft: () => void;
  };
  layout: {
    phase: "PRE" | "LIVE" | "POST";
    showRosterOnly: boolean;
    boardCols: string;
    rails: {
      ledger: {
        visible: boolean;
        collapsed: boolean;
        hide: () => void;
        show: () => void;
      };
      myRoster: {
        visible: boolean;
        collapsed: boolean;
        hide: () => void;
        show: () => void;
      };
      autodraft: {
        visible: boolean;
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
      icon: string | null;
      label: string;
      active: boolean;
    }>;
  };
  pool: {
    categories: Array<{
      id: number;
      title: string;
      icon: string;
      nominations: Array<{
        id: number;
        label: string;
        muted: boolean;
        selected: boolean;
      }>;
      emptyText: string | null;
    }>;
    onSelectNomination: (id: number) => void;
  };
  myRoster: {
    seatNumber: number | null;
    picks: Array<{
      pickNumber: number;
      roundPick: string;
      icon: string | null;
      label: string;
    }>;
    selected: { id: number; icon: string | null; label: string } | null;
    clearSelection: () => void;
    canPick: boolean;
    pickDisabledReason: string | null;
    pickLoading: boolean;
    pickState: ApiResult | null;
    submitPick: () => void;
  };
  rosterBoard: {
    seats: Array<{ seatNumber: number; username: string | null }>;
    maxRows: number;
    rowsBySeat: Map<
      number,
      Array<{ pickNumber: number; icon: string | null; label: string }>
    >;
    emptyText: string | null;
  };
  refresh: () => void;
};

export function useDraftRoomOrchestration(args: {
  initialDraftId?: string | number;
  disabled?: boolean;
}): DraftRoomOrchestration {
  const { initialDraftId, disabled } = args;

  const [draftId] = useState(String(initialDraftId ?? "1"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

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
  const [nowTs, setNowTs] = useState(() => Date.now());

  const socketRef = useRef<Socket | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const lastVersionRef = useRef<number | null>(null);

  const loadSnapshot = useCallback(
    async (options?: { preserveSnapshot?: boolean }) => {
      setLoading(true);
      setError(null);
      if (!options?.preserveSnapshot) setSnapshot(null);

      const res = await fetchJson<Snapshot>(`/drafts/${draftId}/snapshot`, {
        method: "GET"
      });
      if (res.ok && res.data) {
        setSnapshot(res.data);
        setLoading(false);
        return true;
      }
      setError(res.error ?? "Failed to load draft snapshot");
      setLoading(false);
      return false;
    },
    [draftId]
  );

  const refresh = useCallback(() => {
    void loadSnapshot({ preserveSnapshot: true });
  }, [loadSnapshot]);

  useEffect(() => {
    if (!snapshot && !loading) void loadSnapshot();
  }, [loadSnapshot, loading, snapshot]);

  useEffect(() => {
    snapshotRef.current = snapshot;
    lastVersionRef.current = snapshot?.version ?? null;
  }, [snapshot]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const drafted = useMemo(
    () => buildDraftedSet(snapshot?.picks ?? []),
    [snapshot?.picks]
  );
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

  const turn = useMemo(() => (snapshot ? computeTurn(snapshot) : null), [snapshot]);
  const activeSeatNumber = turn?.seat_number ?? null;
  const mySeatNumber = snapshot?.my_seat_number ?? null;

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

  const submitPick = useCallback(async () => {
    if (!snapshot || !selectedNominationId) return;
    setPickLoading(true);
    setPickState(null);

    const res = await fetchJson(`/drafts/${snapshot.draft.id}/picks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nomination_id: selectedNominationId,
        request_id: makeRequestId()
      })
    });

    if (res.ok) {
      setPickState({ ok: true, message: "Pick submitted" });
      setSelectedNominationId(null);
      await loadSnapshot();
    } else {
      setPickState({ ok: false, message: res.error ?? "Pick failed" });
    }
    setPickLoading(false);
  }, [loadSnapshot, selectedNominationId, snapshot]);

  const startDraft = useCallback(async () => {
    if (!snapshot) return;
    setStartLoading(true);
    setStartState(null);
    const res = await fetchJson(`/drafts/${snapshot.draft.id}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    if (res.ok) {
      setStartState({ ok: true, message: "Draft started" });
      await loadSnapshot();
    } else {
      setStartState({ ok: false, message: res.error ?? "Failed to start draft" });
    }
    setStartLoading(false);
  }, [loadSnapshot, snapshot]);

  useEffect(() => {
    const draftIdForSocket = snapshot?.draft.id;
    if (!draftIdForSocket || disabled) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const socketBase = API_BASE
      ? new URL(API_BASE, window.location.origin).origin
      : window.location.origin;

    const socket = io(`${socketBase}/drafts`, {
      transports: ["websocket"],
      autoConnect: false,
      auth: { draftId: Number(draftIdForSocket) }
    });
    socketRef.current = socket;

    const onDraftEvent = (event: DraftEventMessage) => {
      const current = snapshotRef.current;
      const currentVersion = lastVersionRef.current;
      if (!current || currentVersion === null) return;
      if (event.draft_id !== current.draft.id) return;

      if (event.event_type === "season.cancelled") {
        setError("Season cancelled.");
        setSnapshot(null);
        socket.disconnect();
        return;
      }

      // For structural changes (e.g. seats created on start), reload the snapshot.
      if (event.event_type === "draft.started" && current.seats.length === 0) {
        void loadSnapshot({ preserveSnapshot: true });
        return;
      }

      // If we missed versions, resync.
      if (event.version > currentVersion + 1) {
        void loadSnapshot({ preserveSnapshot: true });
        return;
      }
      if (event.version !== currentVersion + 1) return;

      setSnapshot((prev) => {
        if (!prev || prev.draft.id !== event.draft_id) return prev;

        const nextDraft = { ...prev.draft, version: event.version };
        if (event.payload?.draft) {
          if (event.payload.draft.status) nextDraft.status = event.payload.draft.status;
          if ("current_pick_number" in event.payload.draft) {
            nextDraft.current_pick_number =
              event.payload.draft.current_pick_number ?? null;
          }
          if (event.payload.draft.completed_at !== undefined)
            nextDraft.completed_at = event.payload.draft.completed_at ?? null;
          if (event.payload.draft.started_at !== undefined)
            nextDraft.started_at = event.payload.draft.started_at ?? null;
        }

        const nextPick = event.payload?.pick;
        const nextPicks = nextPick
          ? prev.picks.some((p) => p.pick_number === nextPick.pick_number)
            ? prev.picks
            : [...prev.picks, nextPick].sort((a, b) => a.pick_number - b.pick_number)
          : prev.picks;

        return { ...prev, draft: nextDraft, picks: nextPicks, version: event.version };
      });
    };

    socket.on("draft:event", onDraftEvent);
    socket.connect();

    return () => {
      socket.off("draft:event", onDraftEvent);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [disabled, loadSnapshot, snapshot?.draft.id]);

  const draftStatus = snapshot?.draft.status ?? null;
  const phase: DraftRoomOrchestration["layout"]["phase"] =
    draftStatus === "PENDING" ? "PRE" : draftStatus === "COMPLETED" ? "POST" : "LIVE";
  const isPre = phase === "PRE";
  const isPost = phase === "POST";

  const showRosterOnly = isPost;

  const rails = useMemo(() => {
    const showLedger = !isPre && !ledgerCollapsed;
    const showRoster = !isPre && !rosterCollapsed;
    const showAutodraft = !autodraftCollapsed;
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
        showLedger: rails.showLedger,
        showRoster: rails.showRoster,
        showAutodraft: rails.showAutodraft
      }),
    [rails.showAutodraft, rails.showLedger, rails.showRoster, snapshot]
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
      icon: string | null;
      label: string;
      active: boolean;
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
        icon,
        label,
        active: activePick === pickNumber
      });
    }
    return rows;
  }, [
    nominationIconById,
    nominationLabelById,
    picksByNumber,
    snapshot,
    turn?.current_pick_number
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
          muted: poolMode === "ALL_MUTED" && isDrafted,
          selected: selectedNominationId === n.id
        };
      });
      return {
        id: c.id,
        title: c.family_name,
        icon,
        nominations,
        emptyText: nominations.length ? null : "No nominees."
      };
    });
  }, [
    drafted,
    iconByCategoryId,
    nominationsByCategoryId,
    poolMode,
    selectedNominationId,
    snapshot
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
        icon: nominationIconById.get(p.nomination_id) ?? null,
        label: nominationLabelById.get(p.nomination_id) ?? `#${p.nomination_id}`
      }));
  }, [mySeatNumber, nominationIconById, nominationLabelById, snapshot]);

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
      Array<{ pickNumber: number; icon: string | null; label: string }>
    >();
    for (const seat of snapshot.seats) {
      out.set(
        seat.seat_number,
        (picksBySeat.get(seat.seat_number) ?? []).map((p) => ({
          pickNumber: p.pick_number,
          icon: nominationIconById.get(p.nomination_id) ?? null,
          label: nominationLabelById.get(p.nomination_id) ?? `#${p.nomination_id}`
        }))
      );
    }
    return out;
  }, [nominationIconById, nominationLabelById, snapshot]);

  const maxRows = useMemo(() => {
    if (!snapshot) return 0;
    const raw = buildPicksBySeat(snapshot);
    return getMaxPicksForSeats(snapshot.seats, raw);
  }, [snapshot]);

  const clockText = snapshot ? computeDraftClockText(snapshot, nowTs) : "—";

  const participants = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.seats.map((s) => ({
      seatNumber: s.seat_number,
      label: s.username ?? `Seat ${s.seat_number}`,
      active: turn?.seat_number === s.seat_number
    }));
  }, [snapshot, turn?.seat_number]);

  const backToSeasonHref = snapshot ? `/seasons/${snapshot.draft.season_id}` : null;

  const isLive = draftStatus === "IN_PROGRESS" || draftStatus === "PAUSED";
  const canToggleView = isLive;
  const canStartDraft = draftStatus === "PENDING";

  return {
    state: {
      loadingInitial: Boolean(loading && !snapshot),
      refreshing: Boolean(loading && snapshot),
      error
    },
    nav: { backToSeasonHref },
    header: {
      participants,
      status: draftStatus,
      roundNumber: turn?.round_number ?? null,
      pickNumber:
        turn?.current_pick_number ?? snapshot?.draft.current_pick_number ?? null,
      clockText,
      poolMode,
      setPoolMode,
      view,
      setView,
      canToggleView,
      canStartDraft,
      startLoading,
      startResult: startState,
      onStartDraft: () => void startDraft()
    },
    layout: {
      phase,
      showRosterOnly,
      boardCols,
      rails: {
        ledger: {
          visible: !isPre && !ledgerCollapsed,
          collapsed: ledgerCollapsed,
          hide: () => setLedgerCollapsed(true),
          show: () => setLedgerCollapsed(false)
        },
        myRoster: {
          visible: !isPre && !rosterCollapsed,
          collapsed: rosterCollapsed,
          hide: () => setRosterCollapsed(true),
          show: () => setRosterCollapsed(false)
        },
        autodraft: {
          visible: !autodraftCollapsed,
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
      submitPick: () => void submitPick()
    },
    rosterBoard: {
      seats:
        snapshot?.seats.map((s) => ({
          seatNumber: s.seat_number,
          username: s.username ?? null
        })) ?? [],
      maxRows,
      rowsBySeat: rosterPicksBySeat,
      emptyText:
        snapshot && snapshot.seats.length === 0
          ? "Roster view is available once the draft starts."
          : null
    },
    refresh
  };
}
