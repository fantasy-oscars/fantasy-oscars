import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import { FormStatus } from "../../../ui/forms";
import { PageError, PageLoader } from "../../../ui/page-state";

type LockState = {
  status: string;
  draft_locked: boolean;
  draft_locked_at: string | null;
};

export function AdminCeremoniesLockPage() {
  const { ceremonyId: ceremonyIdRaw } = useParams();
  const ceremonyId = Number(ceremonyIdRaw);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lockState, setLockState] = useState<LockState | null>(null);
  const [status, setStatus] = useState<ApiResult | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(ceremonyId) || ceremonyId <= 0) {
      setLockState(null);
      setLoading(false);
      setStatus({ ok: false, message: "Invalid ceremony id" });
      return;
    }
    setLoading(true);
    setStatus(null);
    const res = await fetchJson<LockState>(`/admin/ceremonies/${ceremonyId}/lock`, {
      method: "GET"
    });
    setLoading(false);
    if (!res.ok) {
      setLockState(null);
      setStatus({ ok: false, message: res.error ?? "Unable to load lock state" });
      return;
    }
    setLockState(res.data ?? null);
  }, [ceremonyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const lock = useCallback(async () => {
    if (!Number.isFinite(ceremonyId) || ceremonyId <= 0) return;
    if (!window.confirm("Lock this ceremony? This will cancel any in-progress drafts."))
      return;
    setSaving(true);
    setStatus(null);
    const res = await fetchJson<{
      draft_locked_at: string | null;
      cancelled_count?: number;
    }>(`/admin/ceremonies/${ceremonyId}/lock`, { method: "POST" });
    setSaving(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Lock failed" });
      return;
    }
    setStatus({ ok: true, message: "Ceremony locked" });
    await load();
  }, [ceremonyId, load]);

  const archive = useCallback(async () => {
    if (!Number.isFinite(ceremonyId) || ceremonyId <= 0) return;
    if (
      !window.confirm(
        "Archive this ceremony? It will no longer show as active, but data remains viewable."
      )
    )
      return;
    setSaving(true);
    setStatus(null);
    const res = await fetchJson(`/admin/ceremonies/${ceremonyId}/archive`, {
      method: "POST"
    });
    setSaving(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Archive failed" });
      return;
    }
    setStatus({ ok: true, message: "Ceremony archived" });
    await load();
  }, [ceremonyId, load]);

  if (loading && !lockState) return <PageLoader label="Loading lock state..." />;
  if (!lockState && status?.ok === false) return <PageError message={status.message} />;

  return (
    <section className="stack" style={{ marginTop: 16 }}>
      <header>
        <h3>Lock / Archive</h3>
        <p className="muted">
          Lock blocks new seasons/drafts for this ceremony and cancels in-progress drafts.
          Archived ceremonies stop appearing as active.
        </p>
      </header>

      {lockState && (
        <div className="card nested">
          <header className="header-with-controls">
            <div>
              <h4>Status</h4>
              <p className="muted">Current ceremony lifecycle state.</p>
            </div>
            <div className="pill-list">
              <span className="pill">{lockState.status}</span>
              <span className={`pill ${lockState.draft_locked ? "warning" : "muted"}`}>
                {lockState.draft_locked ? "Drafts locked" : "Drafts open"}
              </span>
            </div>
          </header>
          {lockState.draft_locked_at && (
            <p className="muted">
              Locked at {new Date(lockState.draft_locked_at).toLocaleString()}
            </p>
          )}
        </div>
      )}

      <div className="card nested">
        <header>
          <h4>Actions</h4>
          <p className="muted">
            These actions affect all leagues/seasons for this ceremony.
          </p>
        </header>
        <div className="inline-actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="button"
            onClick={() => void lock()}
            disabled={saving}
          >
            Lock ceremony
          </button>
          <button
            type="button"
            className="button danger"
            onClick={() => void archive()}
            disabled={saving}
          >
            Archive ceremony
          </button>
        </div>
        <FormStatus loading={saving} result={status} />
        <p className="muted">
          Note: entering the first winner will also lock the ceremony automatically.
        </p>
      </div>
    </section>
  );
}
