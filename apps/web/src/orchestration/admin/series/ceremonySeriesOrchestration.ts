import { useCallback, useEffect, useState } from "react";
import { notify } from "../../../notifications";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import { useFieldErrors } from "../../useFieldErrors";
import { confirmStructuralEdit } from "./structuralConfirm";
import type { CeremonySeriesAssociation, CeremonySeriesOption } from "./types";

type LoadState = "loading" | "error" | "ready";

export type CeremonyDatesForm = { nominationsOn: string; resultsOn: string };

/** API field -> form input. */
const DATE_FIELD_INPUTS = {
  nominations_on: "nominationsOn",
  results_on: "resultsOn"
} as const;

function notifySuccess(id: string, message: string) {
  notify({
    id,
    severity: "success",
    trigger_type: "user_action",
    scope: "local",
    durability: "ephemeral",
    requires_decision: false,
    message
  });
}

/**
 * The ceremony side of the Series association, plus the ceremony's nomination
 * and results dates. Both can be edited at any ceremony status.
 */
export function useAdminCeremonySeriesOrchestration(args: { ceremonyId: number | null }) {
  const { ceremonyId } = args;
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [associations, setAssociations] = useState<CeremonySeriesAssociation[]>([]);
  const [seriesOptions, setSeriesOptions] = useState<CeremonySeriesOption[]>([]);
  const [datesForm, setDatesForm] = useState<CeremonyDatesForm>({
    nominationsOn: "",
    resultsOn: ""
  });
  const [savingDates, setSavingDates] = useState(false);
  const [datesStatus, setDatesStatus] = useState<ApiResult | null>(null);
  const [working, setWorking] = useState(false);
  const [seriesStatus, setSeriesStatus] = useState<ApiResult | null>(null);
  const fieldErrors = useFieldErrors();
  const { applyFailure, reset: resetFieldErrors } = fieldErrors;

  const loadSeries = useCallback(async () => {
    if (ceremonyId === null) return false;
    const res = await fetchJson<{
      associations: CeremonySeriesAssociation[];
      series: CeremonySeriesOption[];
    }>(`/admin/ceremonies/${ceremonyId}/series`, { method: "GET" });
    if (!res.ok) {
      setError(res.error ?? "Unable to load Series");
      return false;
    }
    setAssociations(res.data?.associations ?? []);
    setSeriesOptions(res.data?.series ?? []);
    return true;
  }, [ceremonyId]);

  const load = useCallback(async () => {
    if (ceremonyId === null) {
      setError("Invalid ceremony id");
      setState("error");
      return;
    }
    const [seriesOk, ceremonyRes] = await Promise.all([
      loadSeries(),
      fetchJson<{
        ceremony: { nominations_on?: string | null; results_on?: string | null };
      }>(`/admin/ceremonies/${ceremonyId}`, { method: "GET" })
    ]);
    if (!seriesOk || !ceremonyRes.ok) {
      if (!ceremonyRes.ok) setError(ceremonyRes.error ?? "Unable to load ceremony");
      setState("error");
      return;
    }
    const ceremony = ceremonyRes.data?.ceremony;
    setDatesForm({
      nominationsOn: ceremony?.nominations_on ?? "",
      resultsOn: ceremony?.results_on ?? ""
    });
    setError(null);
    setState("ready");
  }, [ceremonyId, loadSeries]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveDates = useCallback(async () => {
    if (ceremonyId === null) return false;
    setSavingDates(true);
    setDatesStatus(null);
    resetFieldErrors();
    const res = await fetchJson<{
      ceremony: { nominations_on: string | null; results_on: string | null };
    }>(`/admin/ceremonies/${ceremonyId}/dates`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nominations_on: datesForm.nominationsOn || null,
        results_on: datesForm.resultsOn || null
      })
    });
    setSavingDates(false);
    if (!res.ok) {
      applyFailure(res, DATE_FIELD_INPUTS);
      setDatesStatus({ ok: false, message: res.error ?? "Could not save the dates" });
      return false;
    }
    setDatesForm({
      nominationsOn: res.data?.ceremony.nominations_on ?? "",
      resultsOn: res.data?.ceremony.results_on ?? ""
    });
    notifySuccess("admin.ceremony.dates.save.success", "Dates saved.");
    return true;
  }, [ceremonyId, datesForm, applyFailure, resetFieldErrors]);

  const runSeriesWrite = useCallback(
    async (init: { path: string; method: string; body?: object }, message: string) => {
      setWorking(true);
      setSeriesStatus(null);
      const res = await fetchJson(init.path, {
        method: init.method,
        ...(init.body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(init.body)
            }
          : {})
      });
      setWorking(false);
      if (!res.ok) {
        setSeriesStatus({ ok: false, message: res.error ?? "The change was not saved" });
        return false;
      }
      notifySuccess("admin.ceremony.series.success", message);
      await loadSeries();
      return true;
    },
    [loadSeries]
  );

  const associate = useCallback(
    async (seriesId: number, seriesEventId: number) => {
      if (ceremonyId === null) return false;
      const series = seriesOptions.find((s) => s.id === seriesId);
      if (!series) return false;
      const ok = await confirmStructuralEdit({
        seriesStatus: series.status,
        seriesName: series.name,
        action: "Adding this ceremony"
      });
      if (!ok) return false;
      return runSeriesWrite(
        {
          path: `/admin/ceremonies/${ceremonyId}/series/${seriesId}`,
          method: "PUT",
          body: { series_event_id: seriesEventId }
        },
        "Added to the Series."
      );
    },
    [ceremonyId, seriesOptions, runSeriesWrite]
  );

  const remove = useCallback(
    async (seriesId: number) => {
      if (ceremonyId === null) return false;
      const association = associations.find((a) => a.series_id === seriesId);
      if (!association) return false;
      const ok = await confirmStructuralEdit({
        seriesStatus: association.series_status,
        seriesName: association.series_name,
        action: "Removing this ceremony and its mappings"
      });
      if (!ok) return false;
      return runSeriesWrite(
        { path: `/admin/ceremonies/${ceremonyId}/series/${seriesId}`, method: "DELETE" },
        "Removed from the Series."
      );
    },
    [ceremonyId, associations, runSeriesWrite]
  );

  return {
    state,
    error,
    associations,
    seriesOptions,
    datesForm,
    setDatesForm,
    savingDates,
    datesStatus,
    fieldErrors: fieldErrors.errors,
    clearFieldError: fieldErrors.clear,
    working,
    seriesStatus,
    actions: { saveDates, associate, remove }
  };
}
