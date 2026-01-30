import { Link } from "react-router-dom";
import { PageLoader } from "../ui/page-state";
import { useSeasonsIndex } from "../features/seasons/useSeasonsIndex";

export function SeasonsIndexPage() {
  const { state, error, rows } = useSeasonsIndex();

  return (
    <section className="card">
      <header className="header-with-controls">
        <div>
          <h2>Seasons</h2>
          <p className="muted">Seasons are created per league per ceremony.</p>
        </div>
      </header>

      {state === "loading" && <PageLoader label="Loading seasons..." />}
      {state === "error" && <div className="status status-error">{error}</div>}
      {state === "ready" && rows.length === 0 && <p className="muted">No seasons yet.</p>}
      {state === "ready" && rows.length > 0 && (
        <div className="stack-lg">
          {rows.map(({ league, seasons }) => (
            <div key={league.id} className="card nested">
              <header>
                <h3>{league.name}</h3>
                <p className="muted">League code: {league.code}</p>
              </header>
              {seasons.length === 0 ? (
                <p className="muted">No seasons found for this league.</p>
              ) : (
                <div className="list">
                  {seasons.map((s) => (
                    <div key={s.id} className="list-row">
                      <div>
                        <strong>Season #{s.id}</strong>
                        <p className="muted">
                          Ceremony {s.ceremony_id} • {s.status}
                        </p>
                      </div>
                      <div className="pill-actions">
                        <Link to={`/seasons/${s.id}`}>Open</Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
