import { Link } from "react-router-dom";
import { useAuthContext } from "../auth/context";
import { useSeasonPreview } from "../features/home/useSeasonPreview";

export function HomePage() {
  const { user, loading } = useAuthContext();
  const { state: seasonPreviewState, refresh: refreshSeasonPreview } = useSeasonPreview({
    enabled: Boolean(user)
  });

  const adminPost = {
    title: "Dogfooding Notes: What We're Testing This Week",
    updatedAt: "Jan 2026",
    body: [
      "This is the current announcement space. In MVP, it is intentionally simple: a single \"what's new / what to test\" post.",
      "Focus areas right now: registration/login flows, league + season creation, and draft room stability under refresh/reconnect.",
      "If something feels confusing, write down what you expected to happen and what actually happened, then include the URL and timestamp."
    ]
  };

  return (
    <section className="hero landing">
      <div className="landing-grid">
        <div className="landing-left">
          <section className="card landing-section">
            <header>
              <p className="eyebrow">Draft night, but for awards</p>
              <h2 className="hero-title">Fantasy Oscars</h2>
              <p className="lede">
                Create a league, draft nominees, and watch standings update as winners
                are announced.
              </p>
            </header>
            <div className="inline-actions">
              <Link to="/about" className="button ghost">
                Learn more
              </Link>
            </div>
          </section>

          <article className="card landing-section">
            <header className="header-with-controls">
              <div>
                <h3>{adminPost.title}</h3>
                <p className="muted">Updated {adminPost.updatedAt}</p>
              </div>
              {user?.is_admin && (
                <Link to="/admin" className="button ghost">
                  Admin
                </Link>
              )}
            </header>
            <div className="prose">
              {adminPost.body.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </article>
        </div>

        <aside className="landing-right" aria-label="Actions">
          <section className="card">
            <header>
              <h3>Create a league</h3>
              <p className="muted">
                Create a new league for the active ceremony. If you are signed out, you
                will be prompted to log in first.
              </p>
            </header>
            <div className="stack-sm">
              <Link to="/leagues" className="button">
                New league
              </Link>
              {!loading && !user && (
                <>
                  <Link to="/register" className="button ghost">
                    Create account
                  </Link>
                  <Link to="/login" className="button ghost">
                    Login
                  </Link>
                </>
              )}
            </div>
          </section>

          {user && (
            <section className="landing-season-stack" aria-label="Active seasons">
              <header className="landing-season-header">
                <h3>Active seasons</h3>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void refreshSeasonPreview()}
                  disabled={seasonPreviewState.state === "loading"}
                >
                  Refresh
                </button>
              </header>

              {seasonPreviewState.state === "loading" && (
                <div className="status status-loading" role="status">
                  <span className="spinner" aria-hidden="true" /> Loading seasons…
                </div>
              )}

              {seasonPreviewState.state === "error" && (
                <div className="status status-error" role="status">
                  {seasonPreviewState.message}
                </div>
              )}

              {seasonPreviewState.state === "ready" &&
                seasonPreviewState.seasons.length === 0 && (
                  <div className="card nested landing-season-card">
                    <header>
                      <h4>No active seasons yet</h4>
                      <p className="muted">
                        Create your first league to generate a season for the active
                        ceremony.
                      </p>
                    </header>
                    <Link to="/leagues" className="button ghost">
                      Go to leagues
                    </Link>
                  </div>
                )}

              {seasonPreviewState.state === "ready" &&
                seasonPreviewState.seasons.length > 0 && (
                  <>
                    {seasonPreviewState.seasons.map((s) => (
                      <div key={s.id} className="card nested landing-season-card">
                        <header>
                          <h4>{s.league_name}</h4>
                          <p className="muted">
                            Ceremony {s.ceremony_id} • Season #{s.id} • {s.status}
                          </p>
                        </header>
                        <div className="inline-actions">
                          <Link to={`/seasons/${s.id}`} className="button ghost">
                            Open season
                          </Link>
                        </div>
                      </div>
                    ))}
                    {seasonPreviewState.total > 2 && (
                      <Link to="/seasons" className="landing-see-all">
                        See all active seasons
                      </Link>
                    )}
                  </>
                )}
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}
