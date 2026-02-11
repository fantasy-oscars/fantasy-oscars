import { useCallback, useEffect, useMemo, useState } from "react";
import { notify } from "../../../notifications";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import { isoToLocalInput, localInputToIso } from "../../../decisions/admin/ceremonyDateTime";
import type {
  CeremonyDetail,
  CeremonyOverviewFormState,
  CeremonyStats
} from "./overview/types";

export function useAdminCeremonyOverviewOrchestration(args: {
  ceremonyId: number | null;
}) {
  const { ceremonyId } = args;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<ApiResult | null>(null);

  const [ceremony, setCeremony] = useState<CeremonyDetail | null>(null);
  const [stats, setStats] = useState<CeremonyStats | null>(null);
  const [form, setForm] = useState<CeremonyOverviewFormState>({
    code: "",
    name: "",
    startsAtLocal: "",
    warningHours: "24"
  });

  const load = useCallback(async () => {
    if (ceremonyId === null || !Number.isFinite(ceremonyId) || ceremonyId <= 0) {
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
    notify({
      id: "admin.ceremony.initialize.save.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Saved"
    });
    setStatus(null);
    await load();
  }, [ceremony, form.code, form.name, form.startsAtLocal, form.warningHours, load]);

  const publish = useCallback(async () => {
    if (!ceremony) return;
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
    notify({
      id: "admin.ceremony.publish.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Ceremony published."
    });
    // Avoid stale success messaging on the Publish step; the new ceremony status is the source of truth.
    setStatus(null);
    await load();
  }, [ceremony, load]);

  const readOnly = ceremony?.status === "ARCHIVED";

  return {
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
    actions: { save, publish }
  };
}
