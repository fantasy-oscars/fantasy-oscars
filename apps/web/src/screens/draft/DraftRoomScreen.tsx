import { Link } from "react-router-dom";
import { FormStatus } from "../../ui/forms";
import type { DraftRoomOrchestration } from "../../orchestration/draft";

export function DraftRoomScreen(props: { o: DraftRoomOrchestration }) {
  const { o } = props;

  if (o.state.loadingInitial) {
    return (
      <section className="draft-shell">
        <div className="status status-loading" role="status">
          <span className="spinner" aria-hidden="true" /> Loading draft…
        </div>
      </section>
    );
  }

  if (o.state.error && !o.nav.backToSeasonHref) {
    return (
      <section className="draft-shell">
        <div className="status status-error" role="status">
          Error: {o.state.error}{" "}
          <button type="button" className="ghost" onClick={o.refresh}>
            Retry
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="draft-shell">
      <div className="draft-topbar">
        {o.nav.backToSeasonHref ? (
          <Link to={o.nav.backToSeasonHref} className="button ghost">
            Back to Season
          </Link>
        ) : null}
      </div>

      {!o.layout.showRosterOnly ? <DraftHeader o={o} /> : null}

      {o.layout.phase === "POST" ? (
        <RosterBoard o={o} />
      ) : o.header.view === "roster" && o.layout.phase !== "PRE" ? (
        <RosterBoard o={o} />
      ) : (
        <>
          <div
            className={`draft-board ${o.layout.phase === "PRE" ? "pre" : "live"}`}
            style={{ ["--draft-cols" as never]: o.layout.boardCols }}
          >
            {o.layout.rails.ledger.visible ? <DraftLedger o={o} /> : null}
            <DraftPool o={o} />
            {o.layout.rails.myRoster.visible ? <MyRosterRail o={o} /> : null}
            {o.layout.rails.autodraft.visible ? <AutoDraftRail o={o} /> : null}
          </div>

          {o.layout.phase !== "PRE" && o.layout.rails.ledger.collapsed ? (
            <button
              type="button"
              className="rail-handle rail-handle-left"
              onClick={o.layout.rails.ledger.show}
            >
              Ledger
            </button>
          ) : null}
          {o.layout.phase !== "PRE" && o.layout.rails.myRoster.collapsed ? (
            <button
              type="button"
              className="rail-handle rail-handle-right rail-handle-right-1"
              onClick={o.layout.rails.myRoster.show}
            >
              My roster
            </button>
          ) : null}
          {o.layout.rails.autodraft.collapsed ? (
            <button
              type="button"
              className="rail-handle rail-handle-right rail-handle-right-2"
              onClick={o.layout.rails.autodraft.show}
            >
              Auto-draft
            </button>
          ) : null}
        </>
      )}

      {o.state.refreshing ? (
        <div className="status status-loading" role="status">
          <span className="spinner" aria-hidden="true" /> Refreshing…
        </div>
      ) : null}
    </section>
  );
}

function DraftHeader(props: { o: DraftRoomOrchestration }) {
  const { o } = props;
  const { header } = o;

  return (
    <div className="draft-header">
      <div className="draft-header-left">
        <div className="draft-participants">
          {header.participants.length === 0 ? (
            <span className="muted">Seats will appear when the draft starts.</span>
          ) : (
            header.participants.map((p) => (
              <span
                key={p.seatNumber}
                className={`pill ${p.active ? "pill-active" : ""}`}
                title={`Seat ${p.seatNumber}`}
              >
                {p.label}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="draft-header-meta">
        <div className="draft-meta-row">
          <span className="pill">Status: {header.status ?? "—"}</span>
          {header.roundNumber && header.pickNumber ? (
            <>
              <span className="pill">Round {header.roundNumber}</span>
              <span className="pill">Pick {header.pickNumber}</span>
            </>
          ) : (
            <span className="pill">Pick —</span>
          )}
          <span className="pill">Clock: {header.clockText}</span>
        </div>

        <div className="draft-meta-row">
          <button
            type="button"
            className={header.poolMode === "UNDRAFTED_ONLY" ? "" : "ghost"}
            onClick={() => header.setPoolMode("UNDRAFTED_ONLY")}
          >
            Only undrafted
          </button>
          <button
            type="button"
            className={header.poolMode === "ALL_MUTED" ? "" : "ghost"}
            onClick={() => header.setPoolMode("ALL_MUTED")}
          >
            All (mute drafted)
          </button>

          {header.canToggleView ? (
            <>
              <span className="muted">|</span>
              <button
                type="button"
                className={header.view === "draft" ? "" : "ghost"}
                onClick={() => header.setView("draft")}
              >
                Draft board
              </button>
              <button
                type="button"
                className={header.view === "roster" ? "" : "ghost"}
                onClick={() => header.setView("roster")}
              >
                Roster view
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="draft-header-right">
        {header.canStartDraft ? (
          <div className="inline-actions">
            <button
              type="button"
              onClick={header.onStartDraft}
              disabled={header.startLoading}
            >
              {header.startLoading ? "Starting..." : "Start draft"}
            </button>
          </div>
        ) : null}
        {header.startResult ? (
          <FormStatus loading={header.startLoading} result={header.startResult} />
        ) : null}
      </div>
    </div>
  );
}

function DraftLedger(props: { o: DraftRoomOrchestration }) {
  const { o } = props;
  return (
    <aside className="draft-rail draft-ledger">
      <header className="rail-header">
        <div className="header-with-controls">
          <h4>Draft ledger</h4>
          <button
            type="button"
            className="ghost"
            onClick={o.layout.rails.ledger.hide}
            aria-label="Close ledger"
          >
            ×
          </button>
        </div>
      </header>
      <div className="rail-body">
        <div className="ledger-list">
          {o.ledger.rows.map((r) => (
            <div key={r.pickNumber} className={`ledger-row ${r.active ? "active" : ""}`}>
              <span className="mono">#{r.pickNumber}</span>
              <span className="muted">{r.seatNumber ? `Seat ${r.seatNumber}` : "—"}</span>
              <span className={r.seatNumber ? "" : "muted"}>{r.label}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function DraftPool(props: { o: DraftRoomOrchestration }) {
  const { o } = props;
  return (
    <div className="draft-pool">
      <div className="category-grid">
        {o.pool.categories.map((c) => (
          <div key={c.id} className="category-card">
            <div className="category-header">
              <span className="muted">{c.title}</span>
            </div>
            <div className="category-body">
              {c.emptyText ? (
                <p className="muted small">{c.emptyText}</p>
              ) : (
                c.nominations.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={`nominee-line ${n.muted ? "muted" : ""} ${n.selected ? "selected" : ""}`}
                    onClick={() => o.pool.onSelectNomination(n.id)}
                    title={`Nomination #${n.id}`}
                  >
                    <span className="icon-code mono">{c.icon}</span>
                    <span className="nominee-label">{n.label}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MyRosterRail(props: { o: DraftRoomOrchestration }) {
  const { o } = props;
  const { myRoster } = o;
  return (
    <aside className="draft-rail draft-my-roster">
      <header className="rail-header">
        <div className="header-with-controls">
          <h4>My roster</h4>
          <button
            type="button"
            className="ghost"
            onClick={o.layout.rails.myRoster.hide}
            aria-label="Close roster"
          >
            ×
          </button>
        </div>
      </header>
      <div className="rail-body stack-sm">
        {!myRoster.seatNumber ? (
          <p className="muted">You are not seated in this draft.</p>
        ) : null}

        {myRoster.picks.length === 0 ? (
          <p className="muted">No picks yet.</p>
        ) : (
          <div className="stack-sm">
            {myRoster.picks.map((p) => (
              <div key={p.pickNumber} className="list-row">
                <span className="mono">#{p.pickNumber}</span>
                <span>{p.label}</span>
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

          {myRoster.selected ? (
            <div className="stack-sm">
              <div className="list-row">
                <span className="muted">Selected</span>
                <span>{myRoster.selected.label}</span>
                <button
                  type="button"
                  className="ghost"
                  onClick={myRoster.clearSelection}
                  disabled={myRoster.pickLoading}
                >
                  Clear
                </button>
              </div>
              <button
                type="button"
                onClick={myRoster.submitPick}
                disabled={!myRoster.canPick || myRoster.pickLoading}
              >
                {myRoster.pickLoading ? "Submitting..." : "Submit pick"}
              </button>
            </div>
          ) : (
            <p className="muted small">Nothing selected.</p>
          )}

          {myRoster.pickDisabledReason ? (
            <div className="status status-error">{myRoster.pickDisabledReason}</div>
          ) : null}
          <FormStatus loading={myRoster.pickLoading} result={myRoster.pickState} />
        </div>
      </div>
    </aside>
  );
}

function AutoDraftRail(props: { o: DraftRoomOrchestration }) {
  const { o } = props;
  return (
    <aside className="draft-rail draft-autodraft">
      <header className="rail-header">
        <div className="header-with-controls">
          <h4>Auto-draft</h4>
          <button
            type="button"
            className="ghost"
            onClick={o.layout.rails.autodraft.hide}
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

function RosterBoard(props: { o: DraftRoomOrchestration }) {
  const { o } = props;
  const { seats, maxRows, rowsBySeat, emptyText } = o.rosterBoard;

  if (emptyText) return <p className="muted">{emptyText}</p>;

  return (
    <div className="roster-board">
      <div
        className="roster-grid"
        style={{ gridTemplateColumns: `repeat(${seats.length}, minmax(180px, 1fr))` }}
      >
        {seats.map((s) => (
          <div key={s.seatNumber} className="roster-col">
            <div className="roster-col-header">
              <strong>{s.username ?? `Seat ${s.seatNumber}`}</strong>
              <span className="muted small">Seat {s.seatNumber}</span>
            </div>
            <div className="roster-col-body">
              {Array.from({ length: maxRows }, (_, idx) => {
                const p = (rowsBySeat.get(s.seatNumber) ?? [])[idx] ?? null;
                return (
                  <div key={idx} className={`roster-row ${p ? "" : "muted"}`}>
                    <span className="mono">#{p ? p.pickNumber : ""}</span>
                    <span>{p ? p.label : "—"}</span>
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
