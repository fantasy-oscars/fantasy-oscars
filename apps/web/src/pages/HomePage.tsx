import { Link } from "react-router-dom";
import { useAuthContext } from "../auth/context";
import { useSeasonPreview } from "../features/home/useSeasonPreview";
import { useDynamicContent } from "../features/content/useDynamicContent";
import { useStaticContent } from "../features/content/useStaticContent";
import { Markdown } from "../ui/Markdown";

export function HomePage() {
  const { user, loading } = useAuthContext();
  const { state: seasonPreviewState } = useSeasonPreview({
    enabled: Boolean(user)
  });

  const { view: landingBlurb } = useStaticContent("landing_blurb");
  const { view: homeMain } = useDynamicContent("home_main");

  return (
    <section className="hero landing">
      <div className="landing-grid">
        <div className="landing-left">
          <section className="card landing-section">
            <header>
              <p className="eyebrow">Draft night, but for awards</p>
              <h2 className="hero-title">
                {landingBlurb.state === "ready" && landingBlurb.content.title
                  ? landingBlurb.content.title
                  : "Fantasy Oscars"}
              </h2>
              {landingBlurb.state === "ready" && landingBlurb.content.body_markdown ? (
                <Markdown markdown={landingBlurb.content.body_markdown} />
              ) : (
                <p className="lede">
                  Create a league, draft nominees, and watch standings update as winners
                  are announced.
                </p>
              )}
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
                <h3>
                  {homeMain.state === "ready" && homeMain.content?.title
                    ? homeMain.content.title
                    : "Updates"}
                </h3>
                {homeMain.state === "ready" && homeMain.content?.published_at ? (
                  <p className="muted">
                    Published{" "}
                    {new Date(homeMain.content.published_at).toLocaleDateString(
                      undefined,
                      {
                        year: "numeric",
                        month: "short",
                        day: "numeric"
                      }
                    )}
                  </p>
                ) : null}
              </div>
              {user?.is_admin && (
                <Link to="/admin" className="button ghost">
                  Admin
                </Link>
              )}
            </header>
            {homeMain.state === "loading" ? (
              <p className="muted">Loading...</p>
            ) : homeMain.state === "error" ? (
              <p className="muted">No updates yet.</p>
            ) : homeMain.content ? (
              <Markdown markdown={homeMain.content.body_markdown} />
            ) : (
              <p className="muted">It&apos;s quiet... too quiet.</p>
            )}
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
              <Link to="/leagues/new" className="button">
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
