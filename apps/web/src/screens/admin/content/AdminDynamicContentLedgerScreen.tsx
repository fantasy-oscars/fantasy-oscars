import { Link } from "react-router-dom";
import { FormStatus } from "../../../ui/forms";
import { PageError, PageLoader } from "../../../ui/page-state";
import {
  formatDateTimeForHumans,
  formatSchedule,
  type DynamicKey
} from "../../../decisions/adminContent";
import type { ApiResult } from "../../../lib/types";
import type { CmsDynamicRow } from "../../../orchestration/adminContent";

export function AdminDynamicContentLedgerScreen(props: {
  contentKey: DynamicKey | null;
  meta: { label: string; hint: string } | null;
  loading: boolean;
  busy: boolean;
  status: ApiResult | null;
  entries: CmsDynamicRow[];
  onCreateEntry: () => void;
  onPublishDraft: (draftId: number) => void;
  onUnpublishEntry: (entryId: number) => void;
}) {
  const {
    contentKey,
    meta,
    loading,
    busy,
    status,
    entries,
    onCreateEntry,
    onPublishDraft,
    onUnpublishEntry
  } = props;

  if (!contentKey || !meta) return <PageError message="Unknown dynamic content key" />;
  if (loading) return <PageLoader label="Loading entries..." />;

  return (
    <section className="stack">
      <header className="header-with-controls">
        <div>
          <h3>{meta.label}</h3>
          <p className="muted">{meta.hint}</p>
        </div>
        <div className="inline-actions">
          <button type="button" onClick={onCreateEntry} disabled={busy}>
            New entry
          </button>
        </div>
      </header>

      <FormStatus loading={busy} result={status} />

      {entries.length === 0 ? (
        <div className="empty-state">
          <strong>No entries yet.</strong>
          <div className="muted" style={{ marginTop: 6 }}>
            Create a new entry to start writing.
          </div>
        </div>
      ) : (
        <ul className="list" aria-label="Content entries">
          {entries.map((e) => (
            <li key={e.id} className="list-row">
              <div>
                <strong>{e.title || "(untitled)"}</strong>
                <div className="muted">
                  {e.status === "PUBLISHED" ? "Published" : "Draft"} • updated{" "}
                  {formatDateTimeForHumans(e.updated_at)}
                  {e.published_at
                    ? ` • published ${formatDateTimeForHumans(e.published_at)}`
                    : ""}
                </div>
              </div>
              <div className="inline-actions">
                {e.status === "PUBLISHED" ? (
                  <button
                    type="button"
                    className="pill success"
                    onClick={() => onUnpublishEntry(e.id)}
                    disabled={busy}
                    title="Click to unpublish"
                  >
                    Published
                  </button>
                ) : (
                  <button
                    type="button"
                    className="pill muted"
                    onClick={() => onPublishDraft(e.id)}
                    disabled={busy}
                    title="Click to publish"
                  >
                    Draft
                  </button>
                )}
                {e.variant ? <span className="pill">{e.variant}</span> : null}
                {formatSchedule(e.starts_at, e.ends_at) ? (
                  <span className="pill">{formatSchedule(e.starts_at, e.ends_at)}</span>
                ) : null}
                <Link
                  className="button ghost"
                  to={`/admin/content/dynamic/${contentKey}/drafts/${e.id}`}
                >
                  {e.status === "DRAFT" ? "Edit" : "View"}
                </Link>
                {e.status === "PUBLISHED" ? (
                  <button
                    type="button"
                    className="button"
                    onClick={() => onUnpublishEntry(e.id)}
                    disabled={busy}
                  >
                    Unpublish
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
