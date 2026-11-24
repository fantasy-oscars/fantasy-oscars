import { useCallback, useEffect, useMemo, useState } from "react";
import { confirm, notify } from "../../../notifications";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import { useFieldErrors } from "../../useFieldErrors";
import {
  isoToLocalInput,
  localInputToIso
} from "../../../decisions/admin/ceremonyDateTime";
import type {
  CeremonyDetail,
  CeremonyOverviewFormState,
  CeremonyStats
} from "./overview/types";

/** API field -> form input, where the two differ. */
const CEREMONY_FIELD_INPUTS = {
  starts_at: "startsAtLocal",
  draft_warning_hours: "warningHours",
  nominations_on: "nominationsOn"
} as const;

export function useAdminCeremonyOverviewOrchestration(args: {
  ceremonyId: number | null;
}) {
  const { ceremonyId } = args;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<ApiResult | null>(null);
  const fieldErrors = useFieldErrors();
  const { applyFailure, reset: resetFieldErrors } = fieldErrors;

  const [ceremony, setCeremony] = useState<CeremonyDetail | null>(null);
  const [stats, setStats] = useState<CeremonyStats | null>(null);
  const [form, setForm] = useState<CeremonyOverviewFormState>({
    code: "",
    name: "",
    nominationsOn: "",
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
        nominationsOn: nextCeremony.nominations_on ?? "",
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
    resetFieldErrors();
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
    if (!res.ok) {
      setSaving(false);
      applyFailure(res, CEREMONY_FIELD_INPUTS);
      setStatus({ ok: false, message: res.error ?? "Save failed" });
      return;
    }
    // The nominations date has its own route; the results date is not
    // entered, it follows the ceremony datetime.
    const nominationsOn = form.nominationsOn || null;
    if (nominationsOn !== (ceremony.nominations_on ?? null)) {
      const dates = await fetchJson(`/admin/ceremonies/${ceremony.id}/dates`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nominations_on: nominationsOn })
      });
      if (!dates.ok) {
        setSaving(false);
        applyFailure(dates, CEREMONY_FIELD_INPUTS);
        setStatus({ ok: false, message: dates.error ?? "Save failed" });
        return;
      }
    }
    setSaving(false);
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
  }, [
    ceremony,
    form.code,
    form.name,
    form.nominationsOn,
    form.startsAtLocal,
    form.warningHours,
    load,
    applyFailure,
    resetFieldErrors
  ]);

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

  /**
   * PUBLISHED → DRAFT, after the admin confirms. The server refuses while any
   * season is set up for the ceremony; its message says how many.
   */
  const withdraw = useCallback(async () => {
    if (!ceremony) return;
    const ok = await confirm({
      title: "Withdraw this ceremony?",
      message:
        "It goes back to draft and players stop seeing it. This is refused while any season is set up for it.",
      confirmLabel: "Withdraw",
      danger: true
    });
    if (!ok) return;
    setWithdrawing(true);
    setStatus(null);
    const res = await fetchJson<{ ceremony: CeremonyDetail }>(
      `/admin/ceremonies/${ceremony.id}/unpublish`,
      { method: "POST" }
    );
    setWithdrawing(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Could not withdraw the ceremony" });
      return;
    }
    notify({
      id: "admin.ceremony.withdraw.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Ceremony withdrawn."
    });
    setStatus(null);
    await load();
  }, [ceremony, load]);

  const openForLeagues = useCallback(async () => {
    if (!ceremony) return;
    setOpening(true);
    setStatus(null);
    const res = await fetchJson<{ ceremony: CeremonyDetail }>(
      `/admin/ceremonies/${ceremony.id}/open`,
      { method: "POST" }
    );
    setOpening(false);
    if (!res.ok) {
      // The refusal names the categories that still need nominees.
      setStatus({ ok: false, message: res.error ?? "Could not open for leagues" });
      return;
    }
    notify({
      id: "admin.ceremony.open.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Ceremony is open for leagues."
    });
    setStatus(null);
    await load();
  }, [ceremony, load]);

  const readOnly = ceremony?.status === "ARCHIVED";

  return {
    loading,
    saving,
    publishing,
    withdrawing,
    opening,
    loadError,
    status,
    ceremony,
    stats,
    form,
    setForm,
    fieldErrors: fieldErrors.errors,
    clearFieldError: fieldErrors.clear,
    completeness,
    readOnly,
    actions: { save, publish, withdraw, openForLeagues }
  };
}
