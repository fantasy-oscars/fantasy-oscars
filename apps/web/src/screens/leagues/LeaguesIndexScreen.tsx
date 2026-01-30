import { Link } from "react-router-dom";
import type { LeaguesIndexView } from "../../orchestration/leagues";
import { PageLoader } from "../../ui/page-state";

export function LeaguesIndexScreen(props: { view: LeaguesIndexView }) {
  const { view } = props;

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

      {view.state === "loading" && <PageLoader label="Loading leagues..." />}
      {view.state === "error" && (
        <div className="status status-error">{view.message}</div>
      )}
      {view.state === "empty" && (
        <div className="empty-state">
          <p className="muted">You are not in any leagues yet.</p>
        </div>
      )}
      {view.state === "ready" && (
        <div className="grid">
          {view.leagues.map((league) => (
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
