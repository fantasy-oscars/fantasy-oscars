import type { ApiResult } from "../../../lib/types";
import type { StaticKey } from "../../../decisions/adminContent";
import { PageError, PageLoader } from "../../../ui/page-state";

export function AdminStaticContentEditorScreen(props: {
  contentKey: StaticKey | null;
  meta: { label: string; hint: string } | null;
  loading: boolean;
  saving: boolean;
  loadError: string | null;
  status: ApiResult | null;
  title: string;
  setTitle: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  onSave: () => void;
}) {
  const {
    contentKey,
    meta,
    loading,
    saving,
    loadError,
    status,
    title,
    setTitle,
    body,
    setBody,
    onSave
  } = props;

  if (!contentKey || !meta) return <PageError message="Unknown static content key" />;
  if (loading) return <PageLoader label="Loading content..." />;

  return (
    <section className="stack">
      <header className="header-with-controls">
        <div>
          <h3>{meta.label}</h3>
          <p className="muted">{meta.hint}</p>
        </div>
        <div className="inline-actions">
          <button type="button" onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </header>

      <section className="card nested">
        <div className="stack-sm">
          {loadError ? (
            <div className="status status-error" role="status" aria-live="polite">
              {loadError} (You can still edit and save.)
            </div>
          ) : null}
          <label className="field">
            <span>Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            <span>Body (Markdown)</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={16} />
          </label>
          {saving ? (
            <div className="status status-loading" role="status" aria-live="polite">
              <span className="spinner" aria-hidden="true" /> Saving...
            </div>
          ) : null}
          {!saving && status ? (
            <div
              className={`status ${status.ok ? "status-success" : "status-error"}`}
              role="status"
              aria-live="polite"
            >
              {status.message}
            </div>
          ) : null}
        </div>
      </section>
    </section>
  );
}
