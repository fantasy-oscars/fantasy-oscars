import { Link } from "react-router-dom";
import { FormStatus } from "../../../ui/forms";
import { PageLoader } from "../../../ui/page-state";
import type { ApiResult } from "../../../lib/types";
import type { CeremonyOption } from "../../../orchestration/adminCeremonies";

export function AdminCeremoniesIndexScreen(props: {
  state: "loading" | "error" | "ready";
  error: string | null;
  ceremonies: CeremonyOption[];
  creating: boolean;
  workingId: number | null;
  status: ApiResult | null;
  onCreate: () => void;
  onDelete: (id: number) => void;
}) {
  const { state, error, ceremonies, creating, workingId, status, onCreate, onDelete } =
    props;

  if (state === "loading") return <PageLoader label="Loading ceremonies..." />;
  if (state === "error")
    return (
      <div className="status status-error">{error ?? "Unable to load ceremonies"}</div>
    );

  return (
    <section className="card">
      <header className="header-with-controls">
        <div>
          <h2>Ceremonies</h2>
          <p className="muted">Create, edit, publish, lock, and archive ceremonies.</p>
        </div>
        <div className="inline-actions">
          <button type="button" className="button" onClick={onCreate} disabled={creating}>
            {creating ? "Creating..." : "New ceremony"}
          </button>
        </div>
      </header>

      <FormStatus loading={creating || workingId !== null} result={status} />

      {ceremonies.length === 0 ? (
        <div className="empty-state">
          <strong>No ceremonies yet.</strong>
          <div className="muted" style={{ marginTop: 6 }}>
            Create one to begin setting up nominees, publishing, and winners.
          </div>
        </div>
      ) : (
        <div className="list">
          {ceremonies.map((c) => (
            <div key={c.id} className="list-row">
              <div>
                <div className="pill-list">
                  <span className="pill">ID {c.id}</span>
                  {c.status ? <span className="pill">{c.status}</span> : null}
                  {c.code ? (
                    <span className="pill">{c.code}</span>
                  ) : (
                    <span className="pill muted">(no code)</span>
                  )}
                </div>
                <p className="muted">
                  {c.name || "(Unnamed)"}{" "}
                  {c.starts_at ? `• ${new Date(c.starts_at).toLocaleString()}` : ""}
                </p>
              </div>
              <div className="pill-actions">
                <Link className="button" to={`/admin/ceremonies/${c.id}/overview`}>
                  Open
                </Link>
                <button
                  type="button"
                  className="button danger"
                  onClick={() => onDelete(c.id)}
                  disabled={workingId === c.id}
                  title="Delete is only allowed for draft ceremonies with no dependent data."
                >
                  {workingId === c.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
