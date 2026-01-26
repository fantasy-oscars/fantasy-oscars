import { Link } from "react-router-dom";

export function AdminContentHomePage() {
  return (
    <section className="stack">
      <section className="card nested">
        <header>
          <h3>Static Content (live)</h3>
          <p className="muted">
            Changes apply immediately. Use for evergreen pages like About/FAQ and legal
            copy.
          </p>
        </header>

        <div className="grid two-col">
          <div className="card nested">
            <h4>Landing</h4>
            <p className="muted">Short blurb at the top of the landing page.</p>
            <div className="inline-actions">
              <Link to="/admin/content/static/landing_blurb" className="button ghost">
                Edit landing blurb
              </Link>
            </div>
          </div>

          <div className="card nested">
            <h4>Site Pages</h4>
            <p className="muted">Evergreen pages shown in the main nav/footer.</p>
            <div className="inline-actions">
              <Link to="/admin/content/static/about" className="button ghost">
                Edit About
              </Link>
              <Link to="/admin/content/static/faq" className="button ghost">
                Edit FAQ
              </Link>
            </div>
          </div>

          <div className="card nested">
            <h4>Legal</h4>
            <p className="muted">Live legal copy.</p>
            <div className="inline-actions">
              <Link to="/admin/content/static/code_of_conduct" className="button ghost">
                Edit Code of Conduct
              </Link>
              <Link to="/admin/content/static/legal_terms" className="button ghost">
                Edit Terms
              </Link>
              <Link to="/admin/content/static/legal_privacy" className="button ghost">
                Edit Privacy
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="card nested">
        <header>
          <h3>Dynamic Content (publish)</h3>
          <p className="muted">
            Draft, review, and publish. Treat these like blog entries with a
            ledger/history.
          </p>
        </header>

        <div className="grid two-col">
          <div className="card nested">
            <h4>Home main body</h4>
            <p className="muted">The longer prose block on the landing page.</p>
            <div className="inline-actions">
              <Link to="/admin/content/dynamic/home_main" className="button ghost">
                Manage entries
              </Link>
            </div>
          </div>

          <div className="card nested">
            <h4>Banner</h4>
            <p className="muted">
              A short in-app banner message (UI surface coming soon).
            </p>
            <div className="inline-actions">
              <Link to="/admin/content/dynamic/banner" className="button ghost">
                Manage entries
              </Link>
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}
