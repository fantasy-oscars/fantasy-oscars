import { Link } from "react-router-dom";
import { PageLoader } from "../ui/page-state";
import { useMyLeagues } from "../features/leagues/useMyLeagues";

export function LeaguesPage() {
  const my = useMyLeagues();

  return (
    <section className="card">
      <header className="header-with-controls">
        <div>
          <h2>Leagues</h2>
          <p>Browse or manage your leagues.</p>
        </div>
        <div className="inline-actions">
          <Link to="/leagues/new" className="button">
            Create league
          </Link>
        </div>
      </header>

      {my.state === "loading" && <PageLoader label="Loading leagues..." />}
      {my.state === "error" && <div className="status status-error">{my.error}</div>}
      {my.state === "empty" && (
        <div className="empty-state">
          <p className="muted">You are not in any leagues yet.</p>
        </div>
      )}
      {my.state === "ready" && (
        <div className="grid">
          {my.leagues.map((league) => (
            <div key={league.id} className="card nested">
              <header>
                <h3>{league.name}</h3>
                <p className="muted">Code: {league.code}</p>
              </header>
              <div className="inline-actions">
                <Link to={`/leagues/${league.id}`}>Open league</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
