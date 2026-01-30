import { FormStatus } from "../../../ui/forms";
import { PageError, PageLoader } from "../../../ui/page-state";
import type { ApiResult } from "../../../lib/types";

export function AdminCeremoniesLockScreen(props: {
  loading: boolean;
  saving: boolean;
  lockState: {
    status: string;
    draft_locked: boolean;
    draft_locked_at: string | null;
  } | null;
  status: ApiResult | null;
  onLock: () => void;
  onArchive: () => void;
}) {
  const { loading, saving, lockState, status, onLock, onArchive } = props;

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

      {lockState ? (
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
          {lockState.draft_locked_at ? (
            <p className="muted">
              Locked at {new Date(lockState.draft_locked_at).toLocaleString()}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="card nested">
        <header>
          <h4>Actions</h4>
          <p className="muted">
            These actions affect all leagues/seasons for this ceremony.
          </p>
        </header>
        <div className="inline-actions" style={{ marginTop: 12 }}>
          <button type="button" className="button" onClick={onLock} disabled={saving}>
            Lock ceremony
          </button>
          <button
            type="button"
            className="button danger"
            onClick={onArchive}
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
