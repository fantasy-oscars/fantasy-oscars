import { Link } from "react-router-dom";
import { FormStatus } from "../../../ui/forms";
import { PageError, PageLoader } from "../../../ui/page-state";
import type { ApiResult } from "../../../lib/types";
import type { CmsDynamicRow } from "../../../orchestration/adminContent";
import type { DynamicKey } from "../../../decisions/adminContent";

export function AdminDynamicContentEditorScreen(props: {
  contentKey: DynamicKey | null;
  meta: { label: string } | null;
  entryId: number | null;
  loading: boolean;
  busy: boolean;
  status: ApiResult | null;
  entry: CmsDynamicRow | null;
  fields: {
    title: string;
    setTitle: (v: string) => void;
    body: string;
    setBody: (v: string) => void;
    variant: "info" | "warning" | "success" | "error";
    setVariant: (v: "info" | "warning" | "success" | "error") => void;
    dismissible: boolean;
    setDismissible: (v: boolean) => void;
    startsAtLocal: string;
    setStartsAtLocal: (v: string) => void;
    endsAtLocal: string;
    setEndsAtLocal: (v: string) => void;
    isBanner: boolean;
  };
  onSave: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
}) {
  const {
    contentKey,
    meta,
    entryId,
    loading,
    busy,
    status,
    entry,
    fields,
    onSave,
    onPublish,
    onUnpublish,
    onDelete
  } = props;

  if (!contentKey || !meta || entryId === null)
    return <PageError message="Invalid content key or entry id" />;
  if (loading) return <PageLoader label="Loading entry..." />;
  if (!entry) return <PageError message={status?.message ?? "Entry not found"} />;

  return (
    <section className="stack">
      <header className="header-with-controls">
        <div>
          <h3>
            {meta.label}: {entry.status === "DRAFT" ? "Draft" : "Published"} #{entry.id}
          </h3>
          <p className="muted">
            {entry.status === "PUBLISHED"
              ? "This entry is published. Saving will update it in place (live)."
              : "Edit the draft and publish when ready."}
          </p>
        </div>
        <div className="inline-actions">
          <Link className="button ghost" to={`/admin/content/dynamic/${contentKey}`}>
            Back to ledger
          </Link>
          {entry.status === "PUBLISHED" ? (
            <>
              <button type="button" className="button" onClick={onSave} disabled={busy}>
                Save
              </button>
              <button
                type="button"
                className="button"
                onClick={onUnpublish}
                disabled={busy}
              >
                Unpublish
              </button>
            </>
          ) : (
            <>
              <button type="button" className="button" onClick={onSave} disabled={busy}>
                Save
              </button>
              <button
                type="button"
                className="button"
                onClick={onPublish}
                disabled={busy}
              >
                Publish
              </button>
              <button
                type="button"
                className="button danger"
                onClick={onDelete}
                disabled={busy}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </header>

      <section className="card nested">
        <div className="stack-sm">
          {fields.isBanner ? (
            <div className="stack-sm">
              <div className="grid two-col">
                <label className="field">
                  <span>Variant</span>
                  <select
                    value={fields.variant}
                    onChange={(e) => fields.setVariant(e.target.value as never)}
                  >
                    <option value="info">info</option>
                    <option value="warning">warning</option>
                    <option value="success">success</option>
                    <option value="error">error</option>
                  </select>
                </label>
                <label className="field">
                  <span>Dismissible</span>
                  <input
                    type="checkbox"
                    checked={fields.dismissible}
                    onChange={(e) => fields.setDismissible(e.target.checked)}
                  />
                </label>
              </div>

              <div className="grid two-col">
                <label className="field">
                  <span>Starts at (optional)</span>
                  <input
                    type="datetime-local"
                    value={fields.startsAtLocal}
                    onChange={(e) => fields.setStartsAtLocal(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Ends at (optional)</span>
                  <input
                    type="datetime-local"
                    value={fields.endsAtLocal}
                    onChange={(e) => fields.setEndsAtLocal(e.target.value)}
                  />
                </label>
              </div>
            </div>
          ) : null}

          <label className="field">
            <span>Title</span>
            <input
              value={fields.title}
              onChange={(e) => fields.setTitle(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Body (Markdown)</span>
            <textarea
              value={fields.body}
              onChange={(e) => fields.setBody(e.target.value)}
              rows={16}
            />
          </label>
          <FormStatus loading={busy} result={status} />
        </div>
      </section>
    </section>
  );
}
