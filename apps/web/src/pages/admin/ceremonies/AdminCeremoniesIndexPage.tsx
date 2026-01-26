import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCeremonyOptions } from "../../../features/admin/useCeremonyOptions";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import { FormStatus } from "../../../ui/forms";
import { PageLoader } from "../../../ui/page-state";

export function AdminCeremoniesIndexPage() {
  const { state, error, options, refresh } = useCeremonyOptions();
  const navigate = useNavigate();

  const [creating, setCreating] = useState(false);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [status, setStatus] = useState<ApiResult | null>(null);

  const createDraftCeremony = useCallback(async () => {
    setCreating(true);
    setStatus(null);
    const res = await fetchJson<{ ceremony: { id: number } }>(
      "/admin/ceremonies/drafts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      }
    );
    setCreating(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Failed to create ceremony" });
      return;
    }
    const id = res.data?.ceremony?.id;
    setStatus({ ok: true, message: "Ceremony created (draft)" });
    await refresh();
    if (id) navigate(`/admin/ceremonies/${id}/overview`);
  }, [navigate, refresh]);

  const deleteCeremony = useCallback(
    async (id: number) => {
      if (!window.confirm("Delete this ceremony? This cannot be undone.")) return;
      setWorkingId(id);
      setStatus(null);
      const res = await fetchJson(`/admin/ceremonies/${id}`, { method: "DELETE" });
      setWorkingId(null);
      if (!res.ok) {
        setStatus({ ok: false, message: res.error ?? "Delete failed" });
        return;
      }
      setStatus({ ok: true, message: "Ceremony deleted" });
      await refresh();
    },
    [refresh]
  );

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
          <button
            type="button"
            className="button"
            onClick={() => void createDraftCeremony()}
            disabled={creating}
          >
            {creating ? "Creating..." : "New ceremony"}
          </button>
        </div>
      </header>

      <FormStatus loading={creating || workingId !== null} result={status} />

      {options.length === 0 ? (
        <div className="empty-state">
          <strong>No ceremonies yet.</strong>
          <div className="muted" style={{ marginTop: 6 }}>
            Create one to begin setting up nominees, publishing, and winners.
          </div>
        </div>
      ) : (
        <div className="list">
          {options.map((c) => (
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
                  onClick={() => void deleteCeremony(c.id)}
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
