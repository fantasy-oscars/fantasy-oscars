import { useParams } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import { PageError, PageLoader } from "../../../ui/page-state";

type StaticKey =
  | "about"
  | "faq"
  | "landing_blurb"
  | "code_of_conduct"
  | "legal_terms"
  | "legal_privacy";

const STATIC_META: Record<StaticKey, { label: string; hint: string }> = {
  landing_blurb: {
    label: "Landing Page Blurb",
    hint: "Live immediately. Keep it short and punchy."
  },
  about: {
    label: "About",
    hint: "Live immediately. Shown at /about."
  },
  faq: {
    label: "FAQ",
    hint: "Live immediately. Shown at /faq."
  },
  code_of_conduct: {
    label: "Code of Conduct",
    hint: "Live immediately. Shown at /code-of-conduct."
  },
  legal_terms: {
    label: "Terms",
    hint: "Live immediately. Shown at /terms."
  },
  legal_privacy: {
    label: "Privacy",
    hint: "Live immediately. Shown at /privacy."
  }
};

export function AdminStaticContentEditorPage() {
  const { key: keyRaw } = useParams();
  const key = keyRaw as StaticKey | undefined;

  const meta = useMemo(() => (key ? STATIC_META[key] : null), [key]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<ApiResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const load = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    setLoadError(null);
    const res = await fetchJson<{
      content: { key: string; title: string; body_markdown: string } | null;
    }>(`/admin/content/static/${encodeURIComponent(key)}`, { method: "GET" });
    setLoading(false);
    if (!res.ok) {
      setTitle("");
      setBody("");
      setLoadError(res.error ?? "Failed to load content");
      return;
    }
    const content = res.data?.content;
    setTitle(content?.title ?? meta?.label ?? "");
    setBody(content?.body_markdown ?? "");
  }, [key, meta?.label]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    if (!key) return;
    setSaving(true);
    setStatus(null);
    const res = await fetchJson<{
      content: { key: string; title: string; body_markdown: string };
    }>(`/admin/content/static/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body_markdown: body })
    });
    setSaving(false);
    if (!res.ok) {
      const raw = res.error ?? "Failed to save";
      const msg =
        raw === "Unexpected error"
          ? "Save failed due to an unexpected server error."
          : raw;
      setStatus({ ok: false, message: msg });
      return;
    }
    setStatus({ ok: true, message: "Saved" });
  }, [body, key, title]);

  if (!key || !meta) return <PageError message="Unknown static content key" />;
  if (loading) return <PageLoader label="Loading content..." />;

  return (
    <section className="stack">
      <header className="header-with-controls">
        <div>
          <h3>{meta.label}</h3>
          <p className="muted">{meta.hint}</p>
        </div>
        <div className="inline-actions">
          <button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </header>

      <section className="card nested">
        <div className="stack-sm">
          {loadError && (
            <div className="status status-error" role="status" aria-live="polite">
              {loadError} (You can still edit and save.)
            </div>
          )}
          <label className="field">
            <span>Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            <span>Body (Markdown)</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={16} />
          </label>
          {saving && (
            <div className="status status-loading" role="status" aria-live="polite">
              <span className="spinner" aria-hidden="true" /> Saving...
            </div>
          )}
          {!saving && status && (
            <div
              className={`status ${status.ok ? "status-success" : "status-error"}`}
              role="status"
              aria-live="polite"
            >
              {status.message}
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
