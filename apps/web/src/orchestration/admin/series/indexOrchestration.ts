import { useCallback, useEffect, useState } from "react";
import { notify } from "../../../notifications";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import { useFieldErrors } from "../../useFieldErrors";
import type { SeriesDetail, SeriesSummary } from "./types";

type LoadState = "loading" | "error" | "ready";

export type SeriesCreateForm = { code: string; name: string; opensOn: string };

/** API field -> form input, where the two differ. */
const SERIES_FIELD_INPUTS = { opens_on: "opensOn" } as const;

export function useAdminSeriesIndexOrchestration() {
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [series, setSeries] = useState<SeriesSummary[]>([]);
  const [form, setForm] = useState<SeriesCreateForm>({ code: "", name: "", opensOn: "" });
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState<ApiResult | null>(null);
  const fieldErrors = useFieldErrors();
  const { applyFailure, reset: resetFieldErrors } = fieldErrors;

  const refresh = useCallback(async () => {
    setError(null);
    const res = await fetchJson<{ series: SeriesSummary[] }>("/admin/series", {
      method: "GET"
    });
    if (!res.ok) {
      setError(res.error ?? "Failed to load Series");
      setState("error");
      return;
    }
    setSeries(res.data?.series ?? []);
    setState("ready");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(async (): Promise<{ ok: boolean; seriesId?: number }> => {
    setCreating(true);
    setStatus(null);
    resetFieldErrors();
    const res = await fetchJson<SeriesDetail>("/admin/series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.code.trim(),
        name: form.name.trim(),
        opens_on: form.opensOn || null
      })
    });
    setCreating(false);
    if (!res.ok) {
      applyFailure(res, SERIES_FIELD_INPUTS);
      setStatus({ ok: false, message: res.error ?? "Could not create the Series" });
      return { ok: false };
    }
    notify({
      id: "admin.series.create.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Series created."
    });
    setForm({ code: "", name: "", opensOn: "" });
    await refresh();
    return { ok: true, seriesId: res.data?.series.id };
  }, [form, applyFailure, resetFieldErrors, refresh]);

  return {
    state,
    error,
    series,
    form,
    setForm,
    fieldErrors: fieldErrors.errors,
    clearFieldError: fieldErrors.clear,
    creating,
    status,
    actions: { create }
  };
}
