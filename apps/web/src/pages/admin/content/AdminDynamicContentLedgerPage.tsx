import { Link, useNavigate, useParams } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import { FormStatus } from "../../../ui/forms";
import { PageError, PageLoader } from "../../../ui/page-state";

type DynamicKey = "banner" | "home_main";

type CmsDynamicRow = {
  id: number;
  key: string;
  title: string;
  body_markdown: string;
  status: "DRAFT" | "PUBLISHED";
  variant?: "info" | "warning" | "success" | "error";
  dismissible?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

const DYNAMIC_META: Record<DynamicKey, { label: string; hint: string }> = {
  home_main: {
    label: "Home Main Body",
    hint: "Long-form content shown on the landing page."
  },
  banner: {
    label: "Banner",
    hint: "Short message shown prominently in-app (UI surface coming soon)."
  }
};

function formatDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function formatSchedule(startsAt?: string | null, endsAt?: string | null) {
  const s = startsAt ? formatDate(startsAt) : null;
  const e = endsAt ? formatDate(endsAt) : null;
  if (s && e) return `${s} – ${e}`;
  if (s) return `Starts ${s}`;
  if (e) return `Ends ${e}`;
  return null;
}

export function AdminDynamicContentLedgerPage() {
  const { key: keyRaw } = useParams();
  const key = keyRaw as DynamicKey | undefined;
  const navigate = useNavigate();

  const meta = useMemo(() => (key ? DYNAMIC_META[key] : null), [key]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ApiResult | null>(null);
  const [entriesRaw, setEntriesRaw] = useState<CmsDynamicRow[]>([]);

  const entries = useMemo(() => {
    return [...entriesRaw].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }, [entriesRaw]);

  const load = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    setStatus(null);
    const res = await fetchJson<{ entries: CmsDynamicRow[] }>(
      `/admin/content/dynamic/${encodeURIComponent(key)}`,
      { method: "GET" }
    );
    setLoading(false);
    if (!res.ok) {
      setEntriesRaw([]);
      setStatus({ ok: false, message: res.error ?? "Failed to load content" });
      return;
    }
    setEntriesRaw(res.data?.entries ?? []);
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  const createEntry = useCallback(async () => {
    if (!key) return;
    setBusy(true);
    setStatus(null);
    const res = await fetchJson<{ draft: CmsDynamicRow }>(
      `/admin/content/dynamic/${encodeURIComponent(key)}/drafts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "", body_markdown: "" })
      }
    );
    setBusy(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Failed to create entry" });
      return;
    }
    const draft = res.data?.draft;
    await load();
    if (draft?.id) navigate(`/admin/content/dynamic/${key}/drafts/${draft.id}`);
  }, [key, load, navigate]);

  const publishDraft = useCallback(
    async (draftId: number) => {
      if (!key) return;
      if (
        !window.confirm(
          "Publish this entry? It will replace the currently published entry."
        )
      ) {
        return;
      }
      setBusy(true);
      setStatus(null);
      const res = await fetchJson<{ published: CmsDynamicRow }>(
        `/admin/content/dynamic/${encodeURIComponent(key)}/drafts/${draftId}/publish`,
        { method: "POST" }
      );
      setBusy(false);
      if (!res.ok) {
        setStatus({ ok: false, message: res.error ?? "Failed to publish" });
        return;
      }
      await load();
      setStatus({ ok: true, message: "Published" });
    },
    [key, load]
  );

  const unpublishEntry = useCallback(
    async (entryId: number) => {
      if (!key) return;
      if (!window.confirm("Unpublish this entry?")) return;
      setBusy(true);
      setStatus(null);
      const res = await fetchJson(
        `/admin/content/dynamic/${encodeURIComponent(key)}/entries/${entryId}/unpublish`,
        { method: "POST" }
      );
      setBusy(false);
      if (!res.ok) {
        setStatus({ ok: false, message: res.error ?? "Failed to unpublish" });
        return;
      }
      await load();
      setStatus({ ok: true, message: "Unpublished" });
    },
    [key, load]
  );

  if (!key || !meta) return <PageError message="Unknown dynamic content key" />;
  if (loading) return <PageLoader label="Loading entries..." />;

  return (
    <section className="stack">
      <header className="header-with-controls">
        <div>
          <h3>{meta.label}</h3>
          <p className="muted">{meta.hint}</p>
        </div>
        <div className="inline-actions">
          <button type="button" onClick={() => void createEntry()} disabled={busy}>
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
                  {formatDate(e.updated_at)}
                  {e.published_at ? ` • published ${formatDate(e.published_at)}` : ""}
                </div>
              </div>
              <div className="inline-actions">
                {e.status === "PUBLISHED" ? (
                  <button
                    type="button"
                    className="pill success"
                    onClick={() => void unpublishEntry(e.id)}
                    disabled={busy}
                    title="Click to unpublish"
                  >
                    Published
                  </button>
                ) : (
                  <button
                    type="button"
                    className="pill muted"
                    onClick={() => void publishDraft(e.id)}
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
                {e.status === "DRAFT" ? (
                  <Link
                    className="button ghost"
                    to={`/admin/content/dynamic/${key}/drafts/${e.id}`}
                  >
                    Edit
                  </Link>
                ) : (
                  <Link
                    className="button ghost"
                    to={`/admin/content/dynamic/${key}/drafts/${e.id}`}
                  >
                    View
                  </Link>
                )}
                {e.status === "PUBLISHED" && (
                  <button
                    type="button"
                    className="button"
                    onClick={() => void unpublishEntry(e.id)}
                    disabled={busy}
                  >
                    Unpublish
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
