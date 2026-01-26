export function AdminSystemAuditLogPage() {
  return (
    <section className="stack">
      <header>
        <h3>Audit Log</h3>
        <p className="muted">Track admin actions (uploads, winner changes, locks).</p>
      </header>

      <div className="empty-state">
        <strong>Not wired yet.</strong>
        <div className="muted" style={{ marginTop: 6 }}>
          We will add an audit table once the API captures admin events.
        </div>
      </div>
    </section>
  );
}
