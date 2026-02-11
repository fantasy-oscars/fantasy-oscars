import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CeremonyOption } from "./types";
import { fetchAdminCeremonies, sortCeremonies } from "./fetchCeremonies";

type LoadState = "loading" | "error" | "ready";

export function useAdminCeremoniesLayoutOrchestration(args: { ceremonyIdRaw?: string }) {
  const ceremonyId = args.ceremonyIdRaw ? Number(args.ceremonyIdRaw) : null;

  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<CeremonyOption[]>([]);

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

  const options = useMemo(() => sortCeremonies(rows), [rows]);
  const hasOptions = options.length > 0;

  const selected = useMemo(() => {
    if (!args.ceremonyIdRaw) return null;
    if (!Number.isFinite(ceremonyId)) return null;
    return options.find((o) => o.id === ceremonyId) ?? null;
  }, [args.ceremonyIdRaw, ceremonyId, options]);

  return { state, error, options, hasOptions, selected };
}

