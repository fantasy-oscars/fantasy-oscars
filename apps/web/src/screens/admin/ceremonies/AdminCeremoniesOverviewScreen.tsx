import { Link } from "react-router-dom";
import type { Dispatch, SetStateAction } from "react";
import { FormStatus } from "../../../ui/forms";
import { PageError, PageLoader } from "../../../ui/page-state";
import type { ApiResult } from "../../../lib/types";

export function AdminCeremoniesOverviewScreen(props: {
  loading: boolean;
  saving: boolean;
  publishing: boolean;
  loadError: string | null;
  status: ApiResult | null;
  ceremony: {
    id: number;
    status: "DRAFT" | "PUBLISHED" | "LOCKED" | "ARCHIVED";
    code: string | null;
    name: string | null;
    starts_at: string | null;
    draft_locked_at: string | null;
    draft_warning_hours: number;
    published_at: string | null;
    archived_at: string | null;
  } | null;
  stats: { nominees_total: number; winners_total: number } | null;
  form: { code: string; name: string; startsAtLocal: string; warningHours: string };
  setForm: Dispatch<
    SetStateAction<{
      code: string;
      name: string;
      startsAtLocal: string;
      warningHours: string;
    }>
  >;
  completeness: { ok: boolean; label: string };
  readOnly: boolean;
  onSave: () => void;
  onPublish: () => void;
}) {
  const {
    loading,
    saving,
    publishing,
    loadError,
    status,
    ceremony,
    stats,
    form,
    setForm,
    completeness,
    readOnly,
    onSave,
    onPublish
  } = props;

  if (loading && !ceremony) return <PageLoader label="Loading ceremony..." />;
  if (loadError) return <PageError message={loadError} />;
  if (!ceremony) return <PageError message="Ceremony not found" />;

  return (
    <div className="stack-lg" style={{ marginTop: 16 }}>
      <div className="card nested">
        <header className="header-with-controls">
          <div>
            <h3>Overview</h3>
            <p className="muted">Configure the ceremony lifecycle and key dates.</p>
          </div>
          <div className="pill-list">
            <span className={`pill ${ceremony.status === "DRAFT" ? "muted" : ""}`}>
              {ceremony.status}
            </span>
            {ceremony.draft_locked_at ? (
              <span className="pill warning">Drafts locked</span>
            ) : null}
          </div>
        </header>

        <div className="pill-list" style={{ marginTop: 8 }}>
          <span className="pill">Nominees: {stats?.nominees_total ?? 0}</span>
          <span className="pill">Winners: {stats?.winners_total ?? 0}</span>
          <span className={`pill ${completeness.ok ? "success" : "warning"}`}>
            {completeness.label}
          </span>
        </div>

        {ceremony.published_at ? (
          <p className="muted">
            Published at {new Date(ceremony.published_at).toLocaleString()}
          </p>
        ) : null}
        {ceremony.archived_at ? (
          <p className="muted">
            Archived at {new Date(ceremony.archived_at).toLocaleString()}
          </p>
        ) : null}
      </div>

      <div className="card nested">
        <header className="header-with-controls">
          <div>
            <h3>Init</h3>
            <p className="muted">Identity and mechanically relevant dates.</p>
          </div>
        </header>

        {readOnly ? (
          <div className="status status-warning" role="status">
            Archived ceremonies are read-only.
          </div>
        ) : null}

        <div className="grid">
          <label className="field">
            <span>Code</span>
            <input
              value={form.code}
              onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
              disabled={readOnly}
              placeholder="Required"
            />
          </label>
          <label className="field">
            <span>Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              disabled={readOnly}
              placeholder="Required"
            />
          </label>
          <label className="field">
            <span>Ceremony at</span>
            <input
              type="datetime-local"
              value={form.startsAtLocal}
              onChange={(e) => setForm((p) => ({ ...p, startsAtLocal: e.target.value }))}
              disabled={readOnly}
            />
          </label>
          <label className="field">
            <span>Draft warning (hours before)</span>
            <input
              type="number"
              min="0"
              max={24 * 14}
              value={form.warningHours}
              onChange={(e) => setForm((p) => ({ ...p, warningHours: e.target.value }))}
              disabled={readOnly}
            />
          </label>
        </div>

        <div className="inline-actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="button"
            onClick={onSave}
            disabled={saving || readOnly}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>

          {ceremony.status === "DRAFT" ? (
            <button
              type="button"
              className="button"
              onClick={onPublish}
              disabled={publishing || !completeness.ok}
              title={
                completeness.ok ? "" : "All categories must have nominees before publish"
              }
            >
              {publishing ? "Publishing..." : "Publish"}
            </button>
          ) : null}

          <Link to={`/admin/ceremonies/${ceremony.id}/nominees`} className="button ghost">
            Manage nominees
          </Link>
          <Link to={`/admin/ceremonies/${ceremony.id}/winners`} className="button ghost">
            Enter winners
          </Link>
        </div>

        {form.code.trim().length === 0 || form.name.trim().length === 0 ? (
          <div className="status status-warning" role="status">
            Code and name are required before publishing.
          </div>
        ) : null}

        <FormStatus loading={saving || publishing} result={status} />
      </div>
    </div>
  );
}
