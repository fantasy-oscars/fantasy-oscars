export function AdminHomePage() {
  return (
    <section className="card">
      <header>
        <h2>Admin</h2>
        <p className="muted">Operational tools for running Fantasy Oscars.</p>
      </header>

      <div className="stack">
        <section className="card nested">
          <h3>Purpose</h3>
          <p className="muted">
            The Admin area exists to set up and maintain the game. Use it to configure
            ceremonies, upload nominee data, enter winners, and lock drafting at the right
            time.
          </p>
          <p className="muted">
            Admin changes can affect all users. If you are unsure, stop and verify in a
            non-prod environment first.
          </p>
        </section>

        <section className="card nested">
          <h3>Responsibilities</h3>
          <ul className="list">
            <li className="list-row">
              <div>
                <strong>Keep the active ceremony correct</strong>
                <div className="muted">
                  Ensure drafts, nominees, and winner entry are pointed at the intended
                  ceremony.
                </div>
              </div>
            </li>
            <li className="list-row">
              <div>
                <strong>Manage nominees carefully</strong>
                <div className="muted">
                  Upload nominee datasets before drafting starts; verify counts and
                  spot-check categories.
                </div>
              </div>
            </li>
            <li className="list-row">
              <div>
                <strong>Enter winners deliberately</strong>
                <div className="muted">
                  The first winner locks drafting for the active ceremony; changes
                  afterward keep drafts locked.
                </div>
              </div>
            </li>
            <li className="list-row">
              <div>
                <strong>Communicate clearly</strong>
                <div className="muted">
                  Post announcements or update static pages when rules, schedules, or
                  scoring details change. (Coming soon.)
                </div>
              </div>
            </li>
          </ul>
        </section>

        <section className="card nested">
          <h3>Operating Notes</h3>
          <div className="status status-warning">
            Winner entry is effectively irreversible for gameplay: even if you change the
            winner, drafting remains locked.
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            Audit logging and user administration will live here as the site matures.
          </p>
        </section>
      </div>
    </section>
  );
}
