import { useState } from "react";
import { useResults } from "../features/results/useResults";

export function ResultsPage() {
  const [draftId, setDraftId] = useState("1");
  const results = useResults(draftId);

  function renderState() {
    if (results.state === "loading") {
      return (
        <div className="status status-loading" role="status">
          <span className="spinner" aria-hidden="true" /> Loading results…
        </div>
      );
    }
    if (results.state === "unavailable") {
      return (
        <div className="status status-warning" role="status">
          Results are not available yet. Winners publish once the ceremony begins; drafts
          lock as soon as the first winner is entered.
        </div>
      );
    }
    if (results.state === "error") {
      return (
        <div className="status status-error" role="status">
          {results.error ?? "Could not load results right now. Try again shortly."}
        </div>
      );
    }
    if (!results.snapshot) {
      return (
        <div className="status status-error" role="status">
          No draft snapshot available.
        </div>
      );
    }

    return (
      <div className="stack-lg">
        <div className="card nested">
          <header className="header-with-controls">
            <div>
              <h3>Winners</h3>
              <p className="muted">
                Final winners by category. Drafting is locked once the first winner is
                recorded.
              </p>
            </div>
          </header>
          {results.winners.length === 0 ? (
            <p className="muted">No winners published yet.</p>
          ) : (
            <div className="grid">
              {results.winners.map((w) => {
                const draftedBySeat = results.snapshot!.picks.find(
                  (p) => p.nomination_id === w.nomination_id
                )?.seat_number;
                return (
                  <div
                    key={`${w.category_edition_id}-${w.nomination_id}`}
                    className="list-row"
                  >
                    <div>
                      <p className="eyebrow">Category {w.category_edition_id}</p>
                      <strong>Nomination #{w.nomination_id}</strong>
                    </div>
                    <div className="pill-list">
                      <span className="pill success">Winner</span>
                      {draftedBySeat ? (
                        <span className="pill">Drafted by seat {draftedBySeat}</span>
                      ) : (
                        <span className="pill muted">Not drafted</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card nested">
          <header className="header-with-controls">
            <div>
              <h3>Season standings</h3>
              <p className="muted">Points by draft seat (1 point per winner drafted).</p>
            </div>
          </header>
          <div className="table">
            <div className="table-row table-head">
              <span>Seat</span>
              <span>Points</span>
            </div>
            {results.standings.map((row) => (
              <div key={row.seat} className="table-row">
                <span>Seat {row.seat}</span>
                <span>{row.points}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card nested">
          <header className="header-with-controls">
            <div>
              <h3>Pick log</h3>
              <p className="muted">Seat picks with win/loss markers.</p>
            </div>
          </header>
          <ul className="list">
            {results.picksWithResult.map((p) => (
              <li key={p.pick_number} className="list-row">
                <span className="pill">Seat {p.seat_number}</span>
                <span>
                  Pick #{p.pick_number}: nomination {p.nomination_id}
                </span>
                <span className={`pill ${p.isWinner ? "success" : "muted"}`}>
                  {p.isWinner ? "Win" : "Loss"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <section className="card">
      <header className="header-with-controls">
        <div>
          <h2>Results</h2>
          <p className="muted">
            Winners + standings (read-only). Drafting locks the moment the first winner is
            entered.
          </p>
        </div>
        <div className="inline-actions">
          <label className="field">
            <span>Draft ID</span>
            <input
              value={draftId}
              onChange={(e) => setDraftId(e.target.value)}
              inputMode="numeric"
              pattern="[0-9]*"
            />
          </label>
        </div>
      </header>
      {renderState()}
    </section>
  );
}
