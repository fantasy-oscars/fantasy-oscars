import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../lib/api";

export type CeremonyIndexRow = {
  id: number;
  code: string | null;
  name: string | null;
  starts_at: string | null;
  status: "PUBLISHED" | "LOCKED" | "COMPLETE" | "ARCHIVED";
};

type LoadState = "loading" | "error" | "ready";

function toTs(iso: string | null): number {
  if (!iso) return -Infinity;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? -Infinity : t;
}

function sortNewestFirst(rows: CeremonyIndexRow[]): CeremonyIndexRow[] {
  return [...rows].sort((a, b) => toTs(b.starts_at) - toTs(a.starts_at) || b.id - a.id);
}

export function useCeremoniesIndexOrchestration() {
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<CeremonyIndexRow[]>([]);

  const refresh = useCallback(async () => {
    setState("loading");
    setError(null);
    const res = await fetchJson<{ ceremonies: CeremonyIndexRow[] }>("/ceremonies", {
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

  const { active, archived } = useMemo(() => {
    const sorted = sortNewestFirst(rows);
    const active = sorted.filter((c) => c.status !== "ARCHIVED");
    const archived = sorted.filter((c) => c.status === "ARCHIVED");
    return { active, archived };
  }, [rows]);

  return { state, error, active, archived, refresh };
}

export type CeremonyDetail = {
  ceremony: {
    id: number;
    code: string | null;
    name: string | null;
    starts_at: string | null;
    status: "PUBLISHED" | "LOCKED" | "COMPLETE" | "ARCHIVED";
  };
  categories: Array<{
    id: number;
    unit_kind: string;
    sort_index: number;
    family_name: string;
    icon_code: string | null;
    icon_variant: "default" | "inverted";
  }>;
  nominations: Array<{
    id: number;
    category_edition_id: number;
    label: string;
    status: string;
    film_title?: string | null;
    film_poster_url?: string | null;
    film_year?: number | null;
    contributors?: string[];
    song_title?: string | null;
    performer_name?: string | null;
    performer_character?: string | null;
    performer_profile_url?: string | null;
    performer_profile_path?: string | null;
  }>;
  winners: Array<{ category_edition_id: number; nomination_id: number }>;
};

export function useCeremonyDetailOrchestration(args: { ceremonyId: number | null }) {
  const { ceremonyId } = args;
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<CeremonyDetail | null>(null);

  const refresh = useCallback(async () => {
    if (!ceremonyId || !Number.isFinite(ceremonyId) || ceremonyId <= 0) {
      setState("error");
      setError("Invalid ceremony id");
      setDetail(null);
      return;
    }
    setState("loading");
    setError(null);
    const res = await fetchJson<CeremonyDetail>(`/ceremonies/${ceremonyId}`, {
      method: "GET"
    });
    if (!res.ok) {
      setDetail(null);
      setError(res.error ?? "Failed to load ceremony");
      setState("error");
      return;
    }
    setDetail(res.data ?? null);
    setState("ready");
  }, [ceremonyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, error, detail, refresh };
}
