import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Link } from "react-router-dom";
import { fetchJson } from "../../lib/api";
import { formatTimer } from "../../lib/draft";
import type { ApiResult, DraftEventMessage, Snapshot } from "../../lib/types";
import { FormStatus } from "../../ui/forms";
import { buildDraftedSet, buildNominationLabelById, iconCodeForCategory } from "./labels";

type Env = { VITE_API_BASE?: string };
const API_BASE = (
  (import.meta as unknown as { env: Env }).env.VITE_API_BASE ?? ""
).trim();

type DraftRoomView = "draft" | "roster";
type PoolMode = "UNDRAFTED_ONLY" | "ALL_MUTED";

function computeTurn(snapshot: Snapshot) {
  if (snapshot.turn) return snapshot.turn;
  const pickNumber = snapshot.draft.current_pick_number ?? null;
  if (!pickNumber || snapshot.seats.length === 0) return null;
  const seatCount = snapshot.seats.length;
  const round = Math.ceil(pickNumber / seatCount);
  const idx = (pickNumber - 1) % seatCount;
  const seatNumber = round % 2 === 1 ? idx + 1 : seatCount - idx;
  const direction = round % 2 === 1 ? ("FORWARD" as const) : ("REVERSE" as const);
  return {
    current_pick_number: pickNumber,
    seat_number: seatNumber,
    round_number: round,
    direction
  };
}

function DraftHeader(props: {
  snapshot: Snapshot;
  nowTs: number;
  view: DraftRoomView;
  setView: (v: DraftRoomView) => void;
  poolMode: PoolMode;
  setPoolMode: (m: PoolMode) => void;
  onStartDraft: () => void;
  startLoading: boolean;
  startResult: ApiResult | null;
  disabled?: boolean;
}) {
  const {
    snapshot,
    nowTs,
    view,
    setView,
    poolMode,
    setPoolMode,
    onStartDraft,
    startLoading,
    startResult,
    disabled
  } = props;

  const turn = computeTurn(snapshot);
  const isLive =
    snapshot.draft.status === "IN_PROGRESS" || snapshot.draft.status === "PAUSED";
  const canToggleView = isLive;

  const timerText = useMemo(
    () => formatTimer(snapshot.draft, nowTs),
    [snapshot.draft, nowTs]
  );

  return (
    <div className="draft-header">
      <div className="draft-header-left">
        <div className="draft-participants">
          {snapshot.seats.length === 0 ? (
            <span className="muted">Seats will appear when the draft starts.</span>
          ) : (
            snapshot.seats.map((s) => (
              <span
                key={s.seat_number}
                className={`pill ${turn?.seat_number === s.seat_number ? "pill-active" : ""}`}
                title={`Seat ${s.seat_number}`}
              >
                {s.username ?? `Seat ${s.seat_number}`}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="draft-header-meta">
        <div className="draft-meta-row">
          <span className="pill">Status: {snapshot.draft.status}</span>
          {turn ? (
            <>
              <span className="pill">Round {turn.round_number}</span>
              <span className="pill">Pick {turn.current_pick_number}</span>
            </>
          ) : (
            <span className="pill">Pick —</span>
          )}
          <span className="pill">Clock: {timerText}</span>
        </div>
        <div className="draft-meta-row">
          <button
            type="button"
            className={poolMode === "UNDRAFTED_ONLY" ? "" : "ghost"}
            onClick={() => setPoolMode("UNDRAFTED_ONLY")}
          >
            Only undrafted
          </button>
          <button
            type="button"
            className={poolMode === "ALL_MUTED" ? "" : "ghost"}
            onClick={() => setPoolMode("ALL_MUTED")}
          >
            All (mute drafted)
          </button>

          {canToggleView ? (
            <>
              <span className="muted">|</span>
              <button
                type="button"
                className={view === "draft" ? "" : "ghost"}
                onClick={() => setView("draft")}
              >
                Draft board
              </button>
              <button
                type="button"
                className={view === "roster" ? "" : "ghost"}
                onClick={() => setView("roster")}
              >
                Roster view
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="draft-header-right">
        {snapshot.draft.status === "PENDING" ? (
          <div className="inline-actions">
            <button
              type="button"
              onClick={onStartDraft}
              disabled={disabled || startLoading}
            >
              {startLoading ? "Starting..." : "Start draft"}
            </button>
          </div>
        ) : null}

        {startResult ? <FormStatus loading={startLoading} result={startResult} /> : null}
      </div>
    </div>
  );
}

function DraftLedger(props: {
  snapshot: Snapshot;
  nominationLabelById: Map<number, string>;
  collapsed: boolean;
  onClose: () => void;
}) {
  const { snapshot, nominationLabelById, collapsed, onClose } = props;
  const total = snapshot.total_picks ?? 0;
  const turn = computeTurn(snapshot);
  const activePick =
    turn?.current_pick_number ?? snapshot.draft.current_pick_number ?? null;

  const picksByNumber = useMemo(() => {
    const map = new Map<number, Snapshot["picks"][number]>();
    for (const p of snapshot.picks) map.set(p.pick_number, p);
    return map;
  }, [snapshot.picks]);

  const activeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ block: "center" });
    }
  }, [activePick]);

  if (collapsed) return null;

  return (
    <aside className="draft-rail draft-ledger">
      <header className="rail-header">
        <div className="header-with-controls">
          <h4>Draft ledger</h4>
          <button
            type="button"
            className="ghost"
            onClick={onClose}
            aria-label="Close ledger"
          >
            ×
          </button>
        </div>
      </header>
      <div className="rail-body">
        <div className="ledger-list">
          {Array.from({ length: total }, (_, idx) => {
            const pickNumber = idx + 1;
            const pick = picksByNumber.get(pickNumber) ?? null;
            const label = pick
              ? (nominationLabelById.get(pick.nomination_id) ?? `#${pick.nomination_id}`)
              : "—";
            const isActive = activePick === pickNumber;
            return (
              <div
                key={pickNumber}
                ref={isActive ? activeRef : null}
                className={`ledger-row ${isActive ? "active" : ""}`}
              >
                <span className="mono">#{pickNumber}</span>
                <span className="muted">{pick ? `Seat ${pick.seat_number}` : "—"}</span>
                <span className={pick ? "" : "muted"}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function DraftPool(props: {
  snapshot: Snapshot;
  poolMode: PoolMode;
  drafted: Set<number>;
  iconByCategoryId: Map<number, string>;
  onSelectNomination: (id: number) => void;
  selectedNominationId: number | null;
}) {
  const {
    snapshot,
    poolMode,
    drafted,
    iconByCategoryId,
    onSelectNomination,
    selectedNominationId
  } = props;
  const categories = snapshot.categories ?? [];
  const nominations = useMemo(() => snapshot.nominations ?? [], [snapshot.nominations]);

  const nominationsByCategory = useMemo(() => {
    const map = new Map<number, typeof nominations>();
    for (const n of nominations) {
      const list = map.get(n.category_edition_id) ?? [];
      list.push(n);
      map.set(n.category_edition_id, list);
    }
    return map;
  }, [nominations]);

  return (
    <div className="draft-pool">
      <div className="category-grid">
        {categories.map((c) => {
          const rows = nominationsByCategory.get(c.id) ?? [];
          const display = rows.filter((n) => n.status === "ACTIVE");
          const filtered =
            poolMode === "UNDRAFTED_ONLY"
              ? display.filter((n) => !drafted.has(n.id))
              : display;
          const icon = iconByCategoryId.get(c.id) ?? "";
          return (
            <div key={c.id} className="category-card">
              <div className="category-header">
                <span className="muted">{c.family_name}</span>
              </div>
              <div className="category-body">
                {filtered.length === 0 ? (
                  <p className="muted small">No nominees.</p>
                ) : (
                  filtered.map((n) => {
                    const isDrafted = drafted.has(n.id);
                    const muted = poolMode === "ALL_MUTED" && isDrafted;
                    const selected = selectedNominationId === n.id;
                    return (
                      <button
                        key={n.id}
                        type="button"
                        className={`nominee-line ${muted ? "muted" : ""} ${selected ? "selected" : ""}`}
                        onClick={() => onSelectNomination(n.id)}
                        title={`Nomination #${n.id}`}
                      >
                        <span className="icon-code mono">{icon}</span>
                        <span className="nominee-label">{n.label}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MyRosterRail(props: {
  snapshot: Snapshot;
  nominationLabelById: Map<number, string>;
  collapsed: boolean;
  selectedNominationId: number | null;
  setSelectedNominationId: (id: number | null) => void;
  canPick: boolean;
  pickDisabledReason: string | null;
  onSubmitPick: () => void;
  pickLoading: boolean;
  pickState: ApiResult | null;
  onClose: () => void;
}) {
  const {
    snapshot,
    nominationLabelById,
    collapsed,
    selectedNominationId,
    setSelectedNominationId,
    canPick,
    pickDisabledReason,
    onSubmitPick,
    pickLoading,
    pickState,
    onClose
  } = props;

  if (collapsed) return null;

  const mySeatNumber = snapshot.my_seat_number ?? null;
  const myPicks = mySeatNumber
    ? snapshot.picks
        .filter((p) => p.seat_number === mySeatNumber)
        .sort((a, b) => a.pick_number - b.pick_number)
    : [];

  const selectedLabel = selectedNominationId
    ? (nominationLabelById.get(selectedNominationId) ?? `#${selectedNominationId}`)
    : null;

  return (
    <aside className="draft-rail draft-my-roster">
      <header className="rail-header">
        <div className="header-with-controls">
          <h4>My roster</h4>
          <button
            type="button"
            className="ghost"
            onClick={onClose}
            aria-label="Close roster"
          >
            ×
          </button>
        </div>
      </header>
      <div className="rail-body stack-sm">
        {!mySeatNumber ? (
          <p className="muted">You are not seated in this draft.</p>
        ) : null}

        {myPicks.length === 0 ? (
          <p className="muted">No picks yet.</p>
        ) : (
          <div className="stack-sm">
            {myPicks.map((p) => (
              <div key={p.pick_number} className="list-row">
                <span className="mono">#{p.pick_number}</span>
                <span>
                  {nominationLabelById.get(p.nomination_id) ?? `#${p.nomination_id}`}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="card nested">
          <header className="header-with-controls">
            <div>
              <h5>Pick</h5>
              <p className="muted small">Select a nominee in the pool, then confirm.</p>
            </div>
          </header>
          {selectedLabel ? (
            <div className="stack-sm">
              <div className="list-row">
                <span className="muted">Selected</span>
                <span>{selectedLabel}</span>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setSelectedNominationId(null)}
                  disabled={pickLoading}
                >
                  Clear
                </button>
              </div>
              <button
                type="button"
                onClick={onSubmitPick}
                disabled={!canPick || pickLoading}
              >
                {pickLoading ? "Submitting..." : "Submit pick"}
              </button>
            </div>
          ) : (
            <p className="muted small">Nothing selected.</p>
          )}
          {pickDisabledReason ? (
            <div className="status status-error">{pickDisabledReason}</div>
          ) : null}
          <FormStatus loading={pickLoading} result={pickState} />
        </div>
      </div>
    </aside>
  );
}

function AutoDraftRail(props: { collapsed: boolean; onClose: () => void }) {
  if (props.collapsed) return null;
  return (
    <aside className="draft-rail draft-autodraft">
      <header className="rail-header">
        <div className="header-with-controls">
          <h4>Auto-draft</h4>
          <button
            type="button"
            className="ghost"
            onClick={props.onClose}
            aria-label="Close auto-draft"
          >
            ×
          </button>
        </div>
      </header>
      <div className="rail-body">
        <p className="muted">Auto-draft is coming soon.</p>
        <p className="muted small">
          You&apos;ll be able to set a per-user strategy and (optionally) a custom ranking
          list.
        </p>
      </div>
    </aside>
  );
}

function RosterBoard(props: {
  snapshot: Snapshot;
  nominationLabelById: Map<number, string>;
}) {
  const { snapshot, nominationLabelById } = props;
  const seats = snapshot.seats;

  const picksBySeat = useMemo(() => {
    const map = new Map<number, Snapshot["picks"]>();
    for (const seat of seats) map.set(seat.seat_number, []);
    for (const p of snapshot.picks) {
      const list = map.get(p.seat_number) ?? [];
      list.push(p);
      map.set(p.seat_number, list);
    }
    for (const [k, list] of map.entries()) {
      list.sort((a, b) => a.pick_number - b.pick_number);
      map.set(k, list);
    }
    return map;
  }, [snapshot.picks, seats]);

  const maxRows = useMemo(() => {
    let max = 0;
    for (const seat of seats) {
      max = Math.max(max, (picksBySeat.get(seat.seat_number) ?? []).length);
    }
    return max;
  }, [picksBySeat, seats]);

  if (seats.length === 0) {
    return <p className="muted">Roster view is available once the draft starts.</p>;
  }

  return (
    <div className="roster-board">
      <div
        className="roster-grid"
        style={{ gridTemplateColumns: `repeat(${seats.length}, minmax(180px, 1fr))` }}
      >
        {seats.map((s) => (
          <div key={s.seat_number} className="roster-col">
            <div className="roster-col-header">
              <strong>{s.username ?? `Seat ${s.seat_number}`}</strong>
              <span className="muted small">Seat {s.seat_number}</span>
            </div>
            <div className="roster-col-body">
              {Array.from({ length: maxRows }, (_, idx) => {
                const p = (picksBySeat.get(s.seat_number) ?? [])[idx] ?? null;
                const label = p
                  ? (nominationLabelById.get(p.nomination_id) ?? `#${p.nomination_id}`)
                  : "—";
                return (
                  <div key={idx} className={`roster-row ${p ? "" : "muted"}`}>
                    <span className="mono">#{p ? p.pick_number : ""}</span>
                    <span>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DraftRoom(props: {
  initialDraftId?: string | number;
  disabled?: boolean;
}) {
  const { initialDraftId, disabled } = props;

  const [draftId] = useState(String(initialDraftId ?? "1"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const [view, setView] = useState<DraftRoomView>("draft");
  const [poolMode, setPoolMode] = useState<PoolMode>("UNDRAFTED_ONLY");
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
  const iconByCategoryId = useMemo(() => iconCodeForCategory(snapshot), [snapshot]);

  const turn = useMemo(() => (snapshot ? computeTurn(snapshot) : null), [snapshot]);
  const activeSeatNumber = turn?.seat_number ?? null;
  const mySeatNumber = snapshot?.my_seat_number ?? null;

  const canPick =
    !!snapshot &&
    snapshot.draft.status === "IN_PROGRESS" &&
    activeSeatNumber !== null &&
    mySeatNumber !== null &&
    mySeatNumber === activeSeatNumber &&
    !disabled;

  const pickDisabledReason = useMemo(() => {
    if (disabled) return "Sign in to make picks.";
    if (!snapshot) return "Load the draft first.";
    if (snapshot.draft.status === "PAUSED") return "Draft is paused.";
    if (snapshot.draft.status !== "IN_PROGRESS") return "Draft is not in progress.";
    if (activeSeatNumber === null) return "Turn information unavailable.";
    if (mySeatNumber === null) return "You are not seated in this draft.";
    if (activeSeatNumber !== mySeatNumber)
      return `Waiting for seat ${activeSeatNumber} to pick.`;
    if (!selectedNominationId) return "Select a nominee first.";
    if (drafted.has(selectedNominationId)) return "That nominee was already drafted.";
    return null;
  }, [activeSeatNumber, disabled, drafted, mySeatNumber, selectedNominationId, snapshot]);

  const submitPick = useCallback(async () => {
    if (!snapshot || !selectedNominationId) return;
    setPickLoading(true);
    setPickState(null);
    const requestId =
      crypto?.randomUUID?.() ??
      `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await fetchJson(`/drafts/${snapshot.draft.id}/picks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nomination_id: selectedNominationId, request_id: requestId })
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
  const isPre = draftStatus === "PENDING";
  const isPost = draftStatus === "COMPLETED";
  const showRosterOnly = isPost;

  const showLedger = !isPre && !ledgerCollapsed;
  const showRoster = !isPre && !rosterCollapsed;
  const showAutodraft = !autodraftCollapsed;
  const draftCols = useMemo(() => {
    if (!snapshot) return "1fr";
    const cols: string[] = [];
    if (showLedger) cols.push("320px");
    cols.push("1fr");
    if (showRoster) cols.push("320px");
    if (showAutodraft) cols.push("280px");
    return cols.join(" ");
  }, [showAutodraft, showLedger, showRoster, snapshot]);

  if (loading && !snapshot) {
    return (
      <section className="draft-shell">
        <div className="status status-loading" role="status">
          <span className="spinner" aria-hidden="true" /> Loading draft…
        </div>
      </section>
    );
  }

  if (error && !snapshot) {
    return (
      <section className="draft-shell">
        <div className="status status-error" role="status">
          Error: {error}{" "}
          <button type="button" className="ghost" onClick={() => void loadSnapshot()}>
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (!snapshot) return null;

  return (
    <section className="draft-shell">
      <div className="draft-topbar">
        <Link to={`/seasons/${snapshot.draft.season_id}`} className="button ghost">
          Back to Season
        </Link>
      </div>

      {!showRosterOnly ? (
        <DraftHeader
          snapshot={snapshot}
          nowTs={nowTs}
          view={view}
          setView={setView}
          poolMode={poolMode}
          setPoolMode={setPoolMode}
          onStartDraft={() => void startDraft()}
          startLoading={startLoading}
          startResult={startState}
          disabled={disabled}
        />
      ) : null}

      {isPost ? (
        <RosterBoard snapshot={snapshot} nominationLabelById={nominationLabelById} />
      ) : view === "roster" && !isPre ? (
        <RosterBoard snapshot={snapshot} nominationLabelById={nominationLabelById} />
      ) : (
        <>
          <div
            className={`draft-board ${isPre ? "pre" : "live"}`}
            style={{ ["--draft-cols" as never]: draftCols }}
          >
            {!isPre && (
              <DraftLedger
                snapshot={snapshot}
                nominationLabelById={nominationLabelById}
                collapsed={ledgerCollapsed}
                onClose={() => setLedgerCollapsed(true)}
              />
            )}
            <DraftPool
              snapshot={snapshot}
              poolMode={poolMode}
              drafted={drafted}
              iconByCategoryId={iconByCategoryId}
              selectedNominationId={selectedNominationId}
              onSelectNomination={(id) => setSelectedNominationId(id)}
            />
            {!isPre ? (
              <MyRosterRail
                snapshot={snapshot}
                nominationLabelById={nominationLabelById}
                collapsed={rosterCollapsed}
                selectedNominationId={selectedNominationId}
                setSelectedNominationId={setSelectedNominationId}
                canPick={canPick}
                pickDisabledReason={pickDisabledReason}
                onSubmitPick={() => void submitPick()}
                pickLoading={pickLoading}
                pickState={pickState}
                onClose={() => setRosterCollapsed(true)}
              />
            ) : null}
            <AutoDraftRail
              collapsed={autodraftCollapsed}
              onClose={() => setAutodraftCollapsed(true)}
            />
          </div>

          {!isPre && ledgerCollapsed ? (
            <button
              type="button"
              className="rail-handle rail-handle-left"
              onClick={() => setLedgerCollapsed(false)}
            >
              Ledger
            </button>
          ) : null}
          {!isPre && rosterCollapsed ? (
            <button
              type="button"
              className="rail-handle rail-handle-right rail-handle-right-1"
              onClick={() => setRosterCollapsed(false)}
            >
              My roster
            </button>
          ) : null}
          {autodraftCollapsed ? (
            <button
              type="button"
              className="rail-handle rail-handle-right rail-handle-right-2"
              onClick={() => setAutodraftCollapsed(false)}
            >
              Auto-draft
            </button>
          ) : null}
        </>
      )}

      {loading && snapshot ? (
        <div className="status status-loading" role="status">
          <span className="spinner" aria-hidden="true" /> Refreshing…
        </div>
      ) : null}
    </section>
  );
}
