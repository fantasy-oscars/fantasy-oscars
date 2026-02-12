import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "../../../lib/api";
import {
  ceremonyStatusLabel,
  getCeremonyWorkflowSteps,
  getNextCeremonyWorkflowStep
} from "../../../decisions/ceremonyWorkflow";

type LoadState = "loading" | "error" | "ready";

export type CeremonyDetail = {
  id: number;
  status: "DRAFT" | "PUBLISHED" | "LOCKED" | "COMPLETE" | "ARCHIVED";
  code: string | null;
  name: string | null;
  year: number | null;
  starts_at: string | null;
  draft_locked_at: string | null;
  draft_warning_hours: number;
  published_at: string | null;
  archived_at: string | null;
};

export type CeremonyStats = {
  categories_total: number;
  categories_with_nominees: number;
  nominees_total: number;
  winners_total: number;
};

export function useAdminCeremonyWorksheetOrchestration(args: {
  ceremonyId: number | null;
}) {
  const { ceremonyId } = args;
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [ceremony, setCeremony] = useState<CeremonyDetail | null>(null);
  const [stats, setStats] = useState<CeremonyStats | null>(null);

  const hasRenderedRef = useRef(false);

  useEffect(() => {
    if (state === "ready") hasRenderedRef.current = true;
  }, [state]);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      const canRefreshInPlace = silent && hasRenderedRef.current;

      if (!ceremonyId || !Number.isFinite(ceremonyId) || ceremonyId <= 0) {
        setError("Invalid ceremony id");
        setState("error");
        return;
      }
      // For background refreshes, avoid flipping the orchestration into "loading"
      // because that unmounts wizard step content and resets local UI state.
      if (!canRefreshInPlace) setState("loading");
      setError(null);
      const res = await fetchJson<{ ceremony: CeremonyDetail; stats: CeremonyStats }>(
        `/admin/ceremonies/${ceremonyId}`,
        { method: "GET" }
      );
      if (!res.ok) {
        // If we already have data, keep rendering and only record the error.
        // This prevents "flash" reloads after actions like adding nominees.
        setError(res.error ?? "Unable to load ceremony");
        if (!canRefreshInPlace) setState("error");
        return;
      }
      setCeremony(res.data?.ceremony ?? null);
      setStats(res.data?.stats ?? null);
      setState("ready");
    },
    [ceremonyId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const statusText = useMemo(() => {
    if (!ceremony) return "—";
    return ceremonyStatusLabel(ceremony.status);
  }, [ceremony]);

  const steps = useMemo(() => {
    if (!ceremony || !stats) return [];
    return getCeremonyWorkflowSteps({ ceremony, stats });
  }, [ceremony, stats]);

  const nextStep = useMemo(() => {
    if (!ceremony || !stats) return null;
    return getNextCeremonyWorkflowStep({ ceremony, stats });
  }, [ceremony, stats]);

  const previewEnabled = Boolean(
    stats && stats.categories_total > 0 && stats.nominees_total > 0
  );

  return {
    state,
    error,
    ceremony,
    stats,
    statusText,
    steps,
    nextStep,
    previewEnabled,
    reload: () => load(),
    reloadSilent: () => load({ silent: true })
  };
}

export type DraftBoardCategory = {
  id: number;
  unit_kind: string;
  sort_index: number;
  family_name: string;
  icon_code: string | null;
};

export type DraftBoardNomination = {
  id: number;
  category_edition_id: number;
  label: string;
  status: string;
};

export function useAdminPreviewDraftBoardOrchestration(args: {
  ceremonyId: number | null;
}) {
  const { ceremonyId } = args;
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<DraftBoardCategory[]>([]);
  const [nominations, setNominations] = useState<DraftBoardNomination[]>([]);

  const load = useCallback(async () => {
    if (!ceremonyId || !Number.isFinite(ceremonyId) || ceremonyId <= 0) {
      setError("Invalid ceremony id");
      setState("error");
      return;
    }
    setState("loading");
    setError(null);
    const res = await fetchJson<{
      categories: DraftBoardCategory[];
      nominations: DraftBoardNomination[];
    }>(`/admin/ceremonies/${ceremonyId}/draft-board`, { method: "GET" });
    if (!res.ok) {
      setError(res.error ?? "Unable to load draft board");
      setCategories([]);
      setNominations([]);
      setState("error");
      return;
    }
    setCategories(res.data?.categories ?? []);
    setNominations(res.data?.nominations ?? []);
    setState("ready");
  }, [ceremonyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const poolCategories = useMemo(() => {
    const byCat = new Map<number, DraftBoardNomination[]>();
    for (const n of nominations) {
      const list = byCat.get(n.category_edition_id) ?? [];
      list.push(n);
      byCat.set(n.category_edition_id, list);
    }

    return categories.map((c) => {
      const active = (byCat.get(c.id) ?? []).filter((n) => n.status === "ACTIVE");
      const icon = c.icon_code ?? "";
      const rows = active.map((n) => ({
        id: n.id,
        label: n.label,
        muted: false,
        selected: false
      }));
      return {
        id: c.id,
        title: c.family_name,
        icon,
        nominations: rows,
        emptyText: rows.length ? null : "No nominees."
      };
    });
  }, [categories, nominations]);

  return { state, error, poolCategories, reload: load };
}
