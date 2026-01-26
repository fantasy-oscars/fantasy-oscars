export function AdminCeremoniesScoringPage() {
  return (
    <section className="stack">
      <header>
        <h3>Scoring</h3>
        <p className="muted">Configure how picks are scored for this ceremony.</p>
      </header>

      <div className="empty-state">
        <strong>Not wired yet.</strong>
        <div className="muted" style={{ marginTop: 6 }}>
          We&apos;ll add scoring configuration once we settle on the scoring model.
        </div>
      </div>
    </section>
  );
}
