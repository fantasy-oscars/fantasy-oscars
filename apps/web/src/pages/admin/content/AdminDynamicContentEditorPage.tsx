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

const DYNAMIC_META: Record<DynamicKey, { label: string }> = {
  home_main: { label: "Home Main Body" },
  banner: { label: "Banner" }
};

export function AdminDynamicContentEditorPage() {
  const { key: keyRaw, id: idRaw } = useParams();
  const key = keyRaw as DynamicKey | undefined;
  const id = idRaw ? Number(idRaw) : NaN;
  const meta = useMemo(() => (key ? DYNAMIC_META[key] : null), [key]);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ApiResult | null>(null);
  const [entry, setEntry] = useState<CmsDynamicRow | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [variant, setVariant] = useState<"info" | "warning" | "success" | "error">(
    "info"
  );
  const [dismissible, setDismissible] = useState(true);
  const [startsAtLocal, setStartsAtLocal] = useState("");
  const [endsAtLocal, setEndsAtLocal] = useState("");

  function isoToLocalInput(value: string | null | undefined) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  }

  function localInputToIso(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  const load = useCallback(async () => {
    if (!key || !Number.isFinite(id)) return;
    setLoading(true);
    setStatus(null);
    const res = await fetchJson<{ entries: CmsDynamicRow[] }>(
      `/admin/content/dynamic/${encodeURIComponent(key)}`,
      { method: "GET" }
    );
    setLoading(false);
    if (!res.ok) {
      setEntry(null);
      setStatus({ ok: false, message: res.error ?? "Failed to load entry" });
      return;
    }
    const list = res.data?.entries ?? [];
    const found = list.find((r) => r.id === id) ?? null;
    setEntry(found);
    if (!found) {
      setStatus({ ok: false, message: "Entry not found" });
    }
  }, [id, key]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setTitle(entry?.title ?? "");
    setBody(entry?.body_markdown ?? "");
    setVariant(
      (entry?.variant as "info" | "warning" | "success" | "error" | undefined) ?? "info"
    );
    setDismissible(typeof entry?.dismissible === "boolean" ? entry.dismissible : true);
    setStartsAtLocal(isoToLocalInput(entry?.starts_at ?? null));
    setEndsAtLocal(isoToLocalInput(entry?.ends_at ?? null));
  }, [entry]);

  const save = useCallback(async () => {
    if (!key || !entry) return;
    setBusy(true);
    setStatus(null);
    const res = await fetchJson<{ draft: CmsDynamicRow }>(
      `/admin/content/dynamic/${encodeURIComponent(key)}/drafts/${entry.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body_markdown: body,
          ...(key === "banner"
            ? {
                variant,
                dismissible,
                starts_at: localInputToIso(startsAtLocal),
                ends_at: localInputToIso(endsAtLocal)
              }
            : {})
        })
      }
    );
    setBusy(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Failed to save" });
      return;
    }
    setStatus({ ok: true, message: "Saved" });
    await load();
  }, [body, dismissible, endsAtLocal, entry, key, load, startsAtLocal, title, variant]);

  const publish = useCallback(async () => {
    if (!key || !entry) return;
    if (entry.status !== "DRAFT") return;
    if (
      !window.confirm(
        "Publish this entry? It will replace the currently published entry."
      )
    )
      return;
    setBusy(true);
    setStatus(null);
    const res = await fetchJson<{ published: CmsDynamicRow }>(
      `/admin/content/dynamic/${encodeURIComponent(key)}/drafts/${entry.id}/publish`,
      { method: "POST" }
    );
    setBusy(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Failed to publish" });
      return;
    }
    setStatus({ ok: true, message: "Published" });
    await load();
  }, [entry, key, load]);

  const unpublish = useCallback(async () => {
    if (!key || !entry) return;
    if (entry.status !== "PUBLISHED") return;
    if (!window.confirm("Unpublish this entry?")) return;
    setBusy(true);
    setStatus(null);
    const res = await fetchJson(
      `/admin/content/dynamic/${encodeURIComponent(key)}/entries/${entry.id}/unpublish`,
      { method: "POST" }
    );
    setBusy(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Failed to unpublish" });
      return;
    }
    setStatus({ ok: true, message: "Unpublished" });
    await load();
  }, [entry, key, load]);

  const deleteEntry = useCallback(async () => {
    if (!key || !entry) return;
    if (entry.status !== "DRAFT") {
      setStatus({ ok: false, message: "Unpublish this entry before deleting." });
      return;
    }
    if (!window.confirm("Delete this draft? This cannot be undone.")) return;
    setBusy(true);
    setStatus(null);
    const res = await fetchJson(
      `/admin/content/dynamic/${encodeURIComponent(key)}/entries/${entry.id}`,
      { method: "DELETE" }
    );
    setBusy(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Failed to delete" });
      return;
    }
    navigate(`/admin/content/dynamic/${key}`);
  }, [entry, key, navigate]);

  if (!key || !meta || !Number.isFinite(id))
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
          <Link className="button ghost" to={`/admin/content/dynamic/${key}`}>
            Back to ledger
          </Link>
          {entry.status === "PUBLISHED" ? (
            <>
              <button
                type="button"
                className="button"
                onClick={() => void save()}
                disabled={busy}
              >
                Save
              </button>
              <button
                type="button"
                className="button"
                onClick={() => void unpublish()}
                disabled={busy}
              >
                Unpublish
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="button"
                onClick={() => void save()}
                disabled={busy}
              >
                Save
              </button>
              <button
                type="button"
                className="button"
                onClick={() => void publish()}
                disabled={busy}
              >
                Publish
              </button>
              <button
                type="button"
                className="button danger"
                onClick={() => void deleteEntry()}
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
          {key === "banner" && (
            <div className="stack-sm">
              <div className="grid two-col">
                <label className="field">
                  <span>Variant</span>
                  <select
                    value={variant}
                    onChange={(e) =>
                      setVariant(
                        e.target.value as "info" | "warning" | "success" | "error"
                      )
                    }
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
                    checked={dismissible}
                    onChange={(e) => setDismissible(e.target.checked)}
                  />
                </label>
              </div>

              <div className="grid two-col">
                <label className="field">
                  <span>Starts at (optional)</span>
                  <input
                    type="datetime-local"
                    value={startsAtLocal}
                    onChange={(e) => setStartsAtLocal(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Ends at (optional)</span>
                  <input
                    type="datetime-local"
                    value={endsAtLocal}
                    onChange={(e) => setEndsAtLocal(e.target.value)}
                  />
                </label>
              </div>
            </div>
          )}
          <label className="field">
            <span>Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={false}
            />
          </label>
          <label className="field">
            <span>Body (Markdown)</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={16}
              disabled={false}
            />
          </label>
          <FormStatus loading={busy} result={status} />
        </div>
      </section>
    </section>
  );
}
