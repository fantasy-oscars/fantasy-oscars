import { useCallback, useEffect, useState } from "react";
import { notify } from "../../../notifications";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import { fetchAdminCeremonies, sortCeremonies } from "../ceremonies/fetchCeremonies";
import type { CeremonyOption } from "../ceremonies/types";
import { confirmStructuralEdit } from "./structuralConfirm";
import type { MissingCeremonyDates, SeriesDetail, SeriesSummary } from "./types";

type LoadState = "loading" | "error" | "ready";

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

export function useAdminSeriesDetailOrchestration(args: { seriesId: number | null }) {
  const { seriesId } = args;
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SeriesDetail | null>(null);
  const [ceremonies, setCeremonies] = useState<CeremonyOption[]>([]);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<ApiResult | null>(null);
  // Set by a successful activation; the response lists ceremonies lacking a date.
  const [activationMissing, setActivationMissing] = useState<
    MissingCeremonyDates[] | null
  >(null);

  const load = useCallback(async () => {
    if (seriesId === null) {
      setError("Invalid Series id");
      setState("error");
      return;
    }
    const [res, ceremoniesRes] = await Promise.all([
      fetchJson<SeriesDetail>(`/admin/series/${seriesId}`, { method: "GET" }),
      fetchAdminCeremonies()
    ]);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Unable to load the Series");
      setState("error");
      return;
    }
    setDetail(res.data);
    setCeremonies(sortCeremonies(ceremoniesRes.data?.ceremonies ?? []));
    setError(null);
    setState("ready");
  }, [seriesId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Runs one write, reports a failure inline, and reloads on success. */
  const write = useCallback(
    async (
      run: () => ReturnType<typeof fetchJson>,
      success: { id: string; message: string }
    ) => {
      setWorking(true);
      setStatus(null);
      const res = await run();
      setWorking(false);
      if (!res.ok) {
        setStatus({ ok: false, message: res.error ?? "The change was not saved" });
        return false;
      }
      notifySuccess(success.id, success.message);
      await load();
      return true;
    },
    [load]
  );

  const confirmEdit = useCallback(
    (series: SeriesSummary, action: string) =>
      confirmStructuralEdit({
        seriesStatus: series.status,
        seriesName: series.name,
        action
      }),
    []
  );

  const associate = useCallback(
    async (ceremonyId: number, seriesEventId: number) => {
      if (!detail) return false;
      if (!(await confirmEdit(detail.series, "Adding a ceremony"))) return false;
      return write(
        () =>
          fetchJson(`/admin/series/${detail.series.id}/ceremonies/${ceremonyId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ series_event_id: seriesEventId })
          }),
        { id: "admin.series.associate.success", message: "Ceremony added." }
      );
    },
    [detail, confirmEdit, write]
  );

  const remove = useCallback(
    async (ceremonyId: number) => {
      if (!detail) return false;
      if (!(await confirmEdit(detail.series, "Removing a ceremony and its mappings")))
        return false;
      return write(
        () =>
          fetchJson(`/admin/series/${detail.series.id}/ceremonies/${ceremonyId}`, {
            method: "DELETE"
          }),
        { id: "admin.series.remove.success", message: "Ceremony removed." }
      );
    },
    [detail, confirmEdit, write]
  );

  /** Maps a category edition to a canonical category; null removes the mapping. */
  const setMapping = useCallback(
    async (categoryEditionId: number, seriesCategoryId: number | null) => {
      if (!detail) return false;
      if (!(await confirmEdit(detail.series, "Changing a category mapping")))
        return false;
      const path = `/admin/series/${detail.series.id}/mappings/${categoryEditionId}`;
      return write(
        () =>
          seriesCategoryId === null
            ? fetchJson(path, { method: "DELETE" })
            : fetchJson(path, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ series_category_id: seriesCategoryId })
              }),
        { id: "admin.series.mapping.success", message: "Mapping saved." }
      );
    },
    [detail, confirmEdit, write]
  );

  const activate = useCallback(async () => {
    if (!detail) return false;
    setWorking(true);
    setStatus(null);
    const res = await fetchJson<{
      readiness: { missing_dates: MissingCeremonyDates[] };
    }>(`/admin/series/${detail.series.id}/activate`, { method: "POST" });
    setWorking(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Could not activate the Series" });
      return false;
    }
    setActivationMissing(res.data?.readiness.missing_dates ?? []);
    notifySuccess("admin.series.activate.success", "Series activated.");
    await load();
    return true;
  }, [detail, load]);

  return {
    state,
    error,
    detail,
    ceremonies,
    working,
    status,
    activationMissing,
    actions: { associate, remove, setMapping, activate }
  };
}
