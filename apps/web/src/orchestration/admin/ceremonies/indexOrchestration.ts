import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notify } from "../../../notifications";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import type { CeremonyOption } from "./types";
import { fetchAdminCeremonies, sortCeremonies } from "./fetchCeremonies";

type LoadState = "loading" | "error" | "ready";

export function useAdminCeremoniesIndexOrchestration() {
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<CeremonyOption[]>([]);

  const [creating, setCreating] = useState(false);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [status, setStatus] = useState<ApiResult | null>(null);

  const hasRenderedRef = useRef(false);
  useEffect(() => {
    if (state === "ready") hasRenderedRef.current = true;
  }, [state]);

  const refresh = useCallback(async () => {
    // Global refresh policy: keep list visible during refresh.
    const canRefreshInPlace = hasRenderedRef.current;
    if (!canRefreshInPlace) setState("loading");
    setError(null);
    const res = await fetchAdminCeremonies();
    if (!res.ok) {
      setError(res.error ?? "Failed to load ceremonies");
      if (!canRefreshInPlace) {
        setRows([]);
        setState("error");
      }
      return;
    }
    setRows(res.data?.ceremonies ?? []);
    setState("ready");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ceremonies = useMemo(() => sortCeremonies(rows), [rows]);

  const createDraftCeremony = useCallback(async () => {
    setCreating(true);
    setStatus(null);
    const res = await fetchJson<{ ceremony: { id: number } }>(
      "/admin/ceremonies/drafts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      }
    );
    setCreating(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Failed to create ceremony" });
      return { ok: false as const, error: res.error ?? "Failed to create ceremony" };
    }
    const id = res.data?.ceremony?.id ?? null;
    notify({
      id: "admin.ceremony.create.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Ceremony created"
    });
    setStatus(null);
    await refresh();
    return { ok: true as const, ceremonyId: id };
  }, [refresh]);

  const deleteCeremony = useCallback(
    async (id: number) => {
      setWorkingId(id);
      // Clear any prior create status so the page doesn't show stale alerts.
      setStatus(null);
      const res = await fetchJson(`/admin/ceremonies/${id}`, { method: "DELETE" });
      setWorkingId(null);
      if (!res.ok) {
        return { ok: false as const, error: res.error ?? "Delete failed" };
      }
      await refresh();
      return { ok: true as const };
    },
    [refresh]
  );

  return {
    state,
    error,
    ceremonies,
    refresh,
    creating,
    workingId,
    status,
    createDraftCeremony,
    deleteCeremony
  };
}
