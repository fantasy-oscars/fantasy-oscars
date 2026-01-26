import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import { FormStatus } from "../../../ui/forms";
import { PageError, PageLoader } from "../../../ui/page-state";

type CeremonyDetail = {
  id: number;
  code: string | null;
  name: string | null;
  starts_at: string | null;
  status: "DRAFT" | "PUBLISHED" | "LOCKED" | "ARCHIVED";
  draft_warning_hours: number;
  draft_locked_at: string | null;
  published_at: string | null;
  archived_at: string | null;
};

type CeremonyStats = {
  categories_total: number;
  categories_with_nominees: number;
  nominees_total: number;
  winners_total: number;
};

type FormState = {
  code: string;
  name: string;
  startsAtLocal: string;
  warningHours: string;
};

function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // datetime-local wants "YYYY-MM-DDTHH:mm"
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function localInputToIso(local: string): string | null {
  const trimmed = local.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function AdminCeremoniesOverviewPage() {
  const { ceremonyId: ceremonyIdRaw } = useParams();
  const ceremonyId = Number(ceremonyIdRaw);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<ApiResult | null>(null);

  const [ceremony, setCeremony] = useState<CeremonyDetail | null>(null);
  const [stats, setStats] = useState<CeremonyStats | null>(null);
  const [form, setForm] = useState<FormState>({
    code: "",
    name: "",
    startsAtLocal: "",
    warningHours: "24"
  });

  const load = useCallback(async () => {
    if (!Number.isFinite(ceremonyId) || ceremonyId <= 0) {
      setLoadError("Invalid ceremony id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    setStatus(null);

    const res = await fetchJson<{ ceremony: CeremonyDetail; stats: CeremonyStats }>(
      `/admin/ceremonies/${ceremonyId}`,
      { method: "GET" }
    );
    setLoading(false);
    if (!res.ok) {
      setLoadError(res.error ?? "Unable to load ceremony");
      return;
    }
    const nextCeremony = res.data?.ceremony ?? null;
    const nextStats = res.data?.stats ?? null;
    setCeremony(nextCeremony);
    setStats(nextStats);
    if (nextCeremony) {
      setForm({
        code: nextCeremony.code ?? "",
        name: nextCeremony.name ?? "",
        startsAtLocal: isoToLocalInput(nextCeremony.starts_at),
        warningHours: String(nextCeremony.draft_warning_hours ?? 24)
      });
    }
  }, [ceremonyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const completeness = useMemo(() => {
    if (!stats) return { ok: false, label: "Loading…" };
    if (stats.categories_total === 0) return { ok: false, label: "No categories" };
    const ok = stats.categories_with_nominees === stats.categories_total;
    return {
      ok,
      label: `${stats.categories_with_nominees}/${stats.categories_total} categories have nominees`
    };
  }, [stats]);

  const save = useCallback(async () => {
    if (!ceremony) return;
    setSaving(true);
    setStatus(null);
    const res = await fetchJson<{ ceremony: CeremonyDetail }>(
      `/admin/ceremonies/${ceremony.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim(),
          name: form.name.trim(),
          starts_at: localInputToIso(form.startsAtLocal),
          draft_warning_hours: Number(form.warningHours)
        })
      }
    );
    setSaving(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Save failed" });
      return;
    }
    setStatus({ ok: true, message: "Saved" });
    await load();
  }, [ceremony, form.code, form.name, form.startsAtLocal, form.warningHours, load]);

  const publish = useCallback(async () => {
    if (!ceremony) return;
    if (
      !window.confirm("Publish this ceremony? This will make it selectable for leagues.")
    )
      return;
    setPublishing(true);
    setStatus(null);
    const res = await fetchJson<{ ceremony: CeremonyDetail }>(
      `/admin/ceremonies/${ceremony.id}/publish`,
      { method: "POST" }
    );
    setPublishing(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Publish failed" });
      return;
    }
    setStatus({ ok: true, message: "Published" });
    await load();
  }, [ceremony, load]);

  if (loading && !ceremony) return <PageLoader label="Loading ceremony..." />;
  if (loadError) return <PageError message={loadError} />;

  if (!ceremony) {
    return (
      <section className="stack">
        <header>
          <h3>Overview</h3>
          <p className="muted">Ceremony not found.</p>
        </header>
      </section>
    );
  }

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
            {ceremony.draft_locked_at && (
              <span className="pill warning">Drafts locked</span>
            )}
          </div>
        </header>

        <div className="pill-list" style={{ marginTop: 8 }}>
          <span className="pill">Nominees: {stats?.nominees_total ?? 0}</span>
          <span className="pill">Winners: {stats?.winners_total ?? 0}</span>
          <span className={`pill ${completeness.ok ? "success" : "warning"}`}>
            {completeness.label}
          </span>
        </div>

        {ceremony.published_at && (
          <p className="muted">
            Published at {new Date(ceremony.published_at).toLocaleString()}
          </p>
        )}
        {ceremony.archived_at && (
          <p className="muted">
            Archived at {new Date(ceremony.archived_at).toLocaleString()}
          </p>
        )}
      </div>

      <div className="card nested">
        <header className="header-with-controls">
          <div>
            <h3>Init</h3>
            <p className="muted">Identity and mechanically relevant dates.</p>
          </div>
        </header>

        {ceremony.status === "ARCHIVED" && (
          <div className="status status-warning" role="status">
            Archived ceremonies are read-only.
          </div>
        )}

        <div className="grid">
          <label className="field">
            <span>Code</span>
            <input
              value={form.code}
              onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
              disabled={ceremony.status === "ARCHIVED"}
              placeholder="Required"
            />
          </label>
          <label className="field">
            <span>Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              disabled={ceremony.status === "ARCHIVED"}
              placeholder="Required"
            />
          </label>
          <label className="field">
            <span>Ceremony at</span>
            <input
              type="datetime-local"
              value={form.startsAtLocal}
              onChange={(e) => setForm((p) => ({ ...p, startsAtLocal: e.target.value }))}
              disabled={ceremony.status === "ARCHIVED"}
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
              disabled={ceremony.status === "ARCHIVED"}
            />
          </label>
        </div>

        <div className="inline-actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="button"
            onClick={() => void save()}
            disabled={saving || ceremony.status === "ARCHIVED"}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>

          {ceremony.status === "DRAFT" && (
            <button
              type="button"
              className="button"
              onClick={() => void publish()}
              disabled={publishing || !completeness.ok}
              title={
                completeness.ok ? "" : "All categories must have nominees before publish"
              }
            >
              {publishing ? "Publishing..." : "Publish"}
            </button>
          )}

          <Link to={`/admin/ceremonies/${ceremony.id}/nominees`} className="button ghost">
            Manage nominees
          </Link>
          <Link to={`/admin/ceremonies/${ceremony.id}/winners`} className="button ghost">
            Enter winners
          </Link>
        </div>

        {(form.code.trim().length === 0 || form.name.trim().length === 0) && (
          <div className="status status-warning" role="status">
            Code and name are required before publishing.
          </div>
        )}

        <FormStatus loading={saving || publishing} result={status} />
      </div>
    </div>
  );
}
