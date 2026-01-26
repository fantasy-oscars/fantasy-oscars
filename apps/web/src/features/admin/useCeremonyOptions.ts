import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../../lib/api";

export type CeremonyOption = {
  id: number;
  code: string | null;
  name: string | null;
  starts_at: string | null;
  status?: string;
};

export type CeremonyOptionsState = "loading" | "error" | "ready";

export function useCeremonyOptions() {
  const [state, setState] = useState<CeremonyOptionsState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<CeremonyOption[]>([]);

  const refresh = useCallback(async () => {
    setState("loading");
    setError(null);
    const res = await fetchJson<{ ceremonies: CeremonyOption[] }>("/admin/ceremonies", {
      method: "GET"
    });
    if (!res.ok) {
      setRows([]);
      setError(res.error ?? "Failed to load ceremonies");
      setState("error");
      return;
    }
    setRows(res.data?.ceremonies ?? []);
    setState("ready");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const options = useMemo(() => {
    // Expect API already sorted, but keep deterministic client ordering.
    // Prefer starts_at (newest first), then id.
    const toTs = (iso: string | null) => {
      if (!iso) return -Infinity;
      const t = new Date(iso).getTime();
      return Number.isNaN(t) ? -Infinity : t;
    };
    return [...rows].sort((a, b) => toTs(b.starts_at) - toTs(a.starts_at) || b.id - a.id);
  }, [rows]);

  return { state, error, options, refresh };
}
