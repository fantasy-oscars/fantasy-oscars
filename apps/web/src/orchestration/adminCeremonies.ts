import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notify } from "../notifications";
import { fetchJson } from "../lib/api";
import type { ApiResult } from "../lib/types";
import { isoToLocalInput, localInputToIso } from "../decisions/admin/ceremonyDateTime";
import { winnersNominationLabel } from "../decisions/admin/winnersNominationLabel";
import type { CeremonyOption } from "./admin/ceremonies/types";
import {
  fetchAdminCeremonies,
  sortCeremonies
} from "./admin/ceremonies/fetchCeremonies";
export type { CeremonyOption } from "./admin/ceremonies/types";

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

type CeremonyDetail = {
  id: number;
  code: string | null;
  name: string | null;
  starts_at: string | null;
  status: "DRAFT" | "PUBLISHED" | "LOCKED" | "COMPLETE" | "ARCHIVED";
  draft_warning_hours: number;
  draft_locked_at: string | null;
  published_at: string | null;
  archived_at: string | null;
};

type CeremonyStats = {
  categories_total: number;
  categories_with_nominees: number;
  nominees_total: number;
  winners_total: number;
};

type CeremonyOverviewFormState = {
  code: string;
  name: string;
  startsAtLocal: string;
  warningHours: string;
};

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

type LockState = {
  status: string;
  draft_locked: boolean;
  draft_locked_at: string | null;
};

export function useAdminCeremonyLockOrchestration(args: { ceremonyId: number | null }) {
  const { ceremonyId } = args;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lockState, setLockState] = useState<LockState | null>(null);
  const [status, setStatus] = useState<ApiResult | null>(null);

  const load = useCallback(async () => {
    if (ceremonyId === null || !Number.isFinite(ceremonyId) || ceremonyId <= 0) {
      setLockState(null);
      setLoading(false);
      setStatus({ ok: false, message: "Invalid ceremony id" });
      return;
    }
    setLoading(true);
    setStatus(null);
    const res = await fetchJson<LockState>(`/admin/ceremonies/${ceremonyId}/lock`, {
      method: "GET"
    });
    setLoading(false);
    if (!res.ok) {
      setLockState(null);
      setStatus({ ok: false, message: res.error ?? "Unable to load lock state" });
      return;
    }
    setLockState(res.data ?? null);
  }, [ceremonyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const lock = useCallback(async () => {
    if (ceremonyId === null || !Number.isFinite(ceremonyId) || ceremonyId <= 0) return;
    setSaving(true);
    setStatus(null);
    const res = await fetchJson<{
      draft_locked_at: string | null;
      cancelled_count?: number;
    }>(`/admin/ceremonies/${ceremonyId}/lock`, { method: "POST" });
    setSaving(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Lock failed" });
      return;
    }
    notify({
      id: "admin.ceremony.lock.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Ceremony locked"
    });
    setStatus(null);
    await load();
  }, [ceremonyId, load]);

  const archive = useCallback(async () => {
    if (ceremonyId === null || !Number.isFinite(ceremonyId) || ceremonyId <= 0) return;
    setSaving(true);
    setStatus(null);
    const res = await fetchJson(`/admin/ceremonies/${ceremonyId}/archive`, {
      method: "POST"
    });
    setSaving(false);
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Archive failed" });
      return;
    }
    notify({
      id: "admin.ceremony.archive.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Ceremony archived"
    });
    setStatus(null);
    await load();
  }, [ceremonyId, load]);

  return { loading, saving, lockState, status, actions: { lock, archive } };
}

type WinnersNominationRow = {
  id: number;
  category_edition_id: number;
  film_title?: string | null;
  song_title?: string | null;
  performer_name?: string | null;
  contributors?: Array<{
    person_id: number;
    full_name: string;
    role_label: string | null;
    sort_order: number;
  }>;
};

export function useAdminCeremonyWinnersOrchestration(args: {
  ceremonyId: number | null;
}) {
  const { ceremonyId } = args;

  const [loading, setLoading] = useState(true);
  const [loadState, setLoadState] = useState<ApiResult | null>(null);
  const [categories, setCategories] = useState<
    Array<{
      id: number;
      unit_kind: "FILM" | "SONG" | "PERFORMANCE";
      family_name?: string | null;
      family_icon_code?: string | null;
      family_icon_variant?: "default" | "inverted" | null;
    }>
  >([]);
  const [nominations, setNominations] = useState<WinnersNominationRow[]>([]);
  const [winnerByCategory, setWinnerByCategory] = useState<Record<number, number[]>>({});
  const [selectedWinner, setSelectedWinner] = useState<Record<number, number[]>>({});
  const [winnerStatus, setWinnerStatus] = useState<Record<number, ApiResult | null>>({});
  const [savingCategory, setSavingCategory] = useState<number | null>(null);
  const [draftLock, setDraftLock] = useState<{
    draft_locked: boolean;
    draft_locked_at: string | null;
  }>({
    draft_locked: false,
    draft_locked_at: null
  });
  const [ceremonyStatus, setCeremonyStatus] = useState<string>("DRAFT");
  const [pendingWinner, setPendingWinner] = useState<{
    categoryId: number;
    nominationIds: number[];
    message: string;
  } | null>(null);
  const [pendingSaveAll, setPendingSaveAll] = useState<{ message: string } | null>(null);
  const [pendingFinalize, setPendingFinalize] = useState<{ message: string } | null>(
    null
  );
  const [finalizeStatus, setFinalizeStatus] = useState<ApiResult | null>(null);

  const load = useCallback(async () => {
    if (ceremonyId === null || !Number.isFinite(ceremonyId) || ceremonyId <= 0) {
      setLoadState({ ok: false, message: "Invalid ceremony id" });
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadState({ ok: true, message: "Loading" });
    const [categoriesRes, nomsRes, winnersRes, lockRes] = await Promise.all([
      fetchJson<{
        categories: Array<{
          id: number;
          unit_kind: "FILM" | "SONG" | "PERFORMANCE";
          family_name?: string | null;
          family_icon_code?: string | null;
          family_icon_variant?: "default" | "inverted" | null;
        }>;
      }>(`/admin/ceremonies/${ceremonyId}/categories`, { method: "GET" }),
      fetchJson<{ nominations: WinnersNominationRow[] }>(
        `/admin/ceremonies/${ceremonyId}/nominations`,
        { method: "GET" }
      ),
      fetchJson<{
        winners: Array<{ category_edition_id: number; nomination_id: number }>;
      }>(`/admin/ceremonies/${ceremonyId}/winners`, { method: "GET" }),
      fetchJson<{
        draft_locked: boolean;
        draft_locked_at: string | null;
        status: string;
      }>(`/admin/ceremonies/${ceremonyId}/lock`, { method: "GET" })
    ]);

    if (!categoriesRes.ok || !nomsRes.ok || !winnersRes.ok || !lockRes.ok) {
      setLoadState({
        ok: false,
        message:
          categoriesRes.error ??
          nomsRes.error ??
          winnersRes.error ??
          lockRes.error ??
          "Failed to load winners context"
      });
      setLoading(false);
      return;
    }

    setCategories(categoriesRes.data?.categories ?? []);
    const noms = nomsRes.data?.nominations ?? [];
    setNominations(noms);

    const winnersMap: Record<number, number[]> = {};
    for (const w of winnersRes.data?.winners ?? []) {
      winnersMap[w.category_edition_id] = winnersMap[w.category_edition_id] ?? [];
      winnersMap[w.category_edition_id].push(w.nomination_id);
    }
    setWinnerByCategory(winnersMap);
    setSelectedWinner((prev) => {
      const next = { ...prev };
      const categories = new Set(noms.map((n) => n.category_edition_id));
      categories.forEach((catId) => {
        if (winnersMap[catId]?.length) next[catId] = winnersMap[catId];
        else if (typeof next[catId] === "undefined") next[catId] = [];
      });
      return next;
    });

    setDraftLock({
      draft_locked: Boolean(lockRes.data?.draft_locked),
      draft_locked_at: lockRes.data?.draft_locked_at ?? null
    });
    setCeremonyStatus(String(lockRes.data?.status ?? "DRAFT").toUpperCase());

    setLoadState({ ok: true, message: "Ready" });
    setLoading(false);
  }, [ceremonyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const groupedNominations = useMemo(() => {
    const groups: Record<number, WinnersNominationRow[]> = {};
    for (const n of nominations) {
      groups[n.category_edition_id] = groups[n.category_edition_id] ?? [];
      groups[n.category_edition_id].push(n);
    }
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    return Object.entries(groups)
      .map(([categoryId, noms]) => {
        const id = Number(categoryId);
        return {
          categoryId: id,
          category: categoryById.get(id) ?? null,
          nominations: noms
        };
      })
      .sort((a, b) => a.categoryId - b.categoryId);
  }, [categories, nominations]);

  const hasAnyWinners = useMemo(
    () => Object.values(winnerByCategory).some((val) => (val ?? []).length > 0),
    [winnerByCategory]
  );

  const isDirty = useMemo(() => {
    const allCategoryIds = new Set<number>();
    for (const n of nominations) allCategoryIds.add(n.category_edition_id);
    for (const c of categories) allCategoryIds.add(c.id);
    for (const catId of allCategoryIds) {
      const a = [...(selectedWinner[catId] ?? [])].sort((x, y) => x - y);
      const b = [...(winnerByCategory[catId] ?? [])].sort((x, y) => x - y);
      if (a.length !== b.length) return true;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true;
    }
    return false;
  }, [categories, nominations, selectedWinner, winnerByCategory]);

  const requestSaveWinners = useCallback(
    (categoryId: number) => {
      const nominationIds = selectedWinner[categoryId] ?? [];
      if (nominationIds.length === 0) {
        setWinnerStatus((prev) => ({
          ...prev,
          [categoryId]: { ok: false, message: "Pick a nomination first" }
        }));
        return;
      }
      const anyWinner = Object.values(winnerByCategory).some(
        (val) => (val ?? []).length > 0
      );
      const existing = winnerByCategory[categoryId] ?? [];

      let message =
        "Save this winner? Drafts will remain locked while winners are being set.";
      if (!anyWinner && !draftLock.draft_locked) {
        message =
          "Saving the first winner will immediately lock drafting for this ceremony. Proceed?";
      } else if (existing.length > 0) {
        message = "Update winners for this category?";
      }

      setPendingWinner({ categoryId, nominationIds, message });
    },
    [draftLock.draft_locked, selectedWinner, winnerByCategory]
  );

  const saveWinners = useCallback(async (categoryId: number, nominationIds: number[]) => {
    setSavingCategory(categoryId);
    setWinnerStatus((prev) => ({ ...prev, [categoryId]: null }));
    const res = await fetchJson<{ draft_locked_at?: string; cancelled_drafts?: number }>(
      "/admin/winners",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_edition_id: categoryId,
          nomination_ids: nominationIds
        })
      }
    );
    setSavingCategory(null);
    if (!res.ok) {
      const msg = res.error ?? "Failed to save winners";
      setWinnerStatus((prev) => ({
        ...prev,
        [categoryId]: { ok: false, message: msg }
      }));
      return { ok: false, message: msg } satisfies ApiResult;
    }
    setWinnerByCategory((prev) => ({ ...prev, [categoryId]: nominationIds }));
    setDraftLock((prev) => ({
      draft_locked: prev.draft_locked || Boolean(res.data?.draft_locked_at),
      draft_locked_at: res.data?.draft_locked_at ?? prev.draft_locked_at
    }));
    setWinnerStatus((prev) => ({
      ...prev,
      [categoryId]: { ok: true, message: "Saved" }
    }));
    return { ok: true, message: "Saved" } satisfies ApiResult;
  }, []);

  const saveAllWinners = useCallback(async () => {
    if (ceremonyId === null) return;
    const changed: Array<{ categoryId: number; nominationIds: number[] }> = [];
    const allCategoryIds = new Set<number>();
    for (const n of nominations) allCategoryIds.add(n.category_edition_id);
    for (const c of categories) allCategoryIds.add(c.id);
    for (const catId of allCategoryIds) {
      const next = [...(selectedWinner[catId] ?? [])].sort((x, y) => x - y);
      const prev = [...(winnerByCategory[catId] ?? [])].sort((x, y) => x - y);
      const same =
        next.length === prev.length && next.every((val, idx) => val === prev[idx]);
      if (!same) changed.push({ categoryId: catId, nominationIds: next });
    }
    if (changed.length === 0) return;

    let firstFailure: ApiResult | null = null;
    for (const item of changed) {
      const res = await saveWinners(item.categoryId, item.nominationIds);
      if (!res.ok && !firstFailure) firstFailure = res;
    }

    if (firstFailure) {
      notify({
        id: "admin.ceremony.winners.save_all.error",
        severity: "error",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        title: "Save failed",
        message: firstFailure.message
      });
    } else {
      notify({
        id: "admin.ceremony.winners.save_all.success",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Winners saved"
      });
    }
  }, [
    categories,
    ceremonyId,
    nominations,
    saveWinners,
    selectedWinner,
    winnerByCategory
  ]);

  const requestSaveAll = useCallback(() => {
    if (!isDirty) return;
    if (!draftLock.draft_locked && !hasAnyWinners) {
      setPendingSaveAll({
        message: "Saving the first winner will lock this ceremony for users. Proceed?"
      });
      return;
    }
    void saveAllWinners();
  }, [draftLock.draft_locked, hasAnyWinners, isDirty, saveAllWinners]);

  const confirmPendingSaveAll = useCallback(() => {
    setPendingSaveAll(null);
    void saveAllWinners();
  }, [saveAllWinners]);

  const requestFinalizeWinners = useCallback(() => {
    setPendingFinalize({
      message:
        "Finalize winners for this ceremony? This will switch user results views to the final results state."
    });
  }, []);

  const confirmFinalizeWinners = useCallback(async () => {
    if (ceremonyId === null) return;
    setPendingFinalize(null);
    setFinalizeStatus({ ok: true, message: "Loading" });
    const res = await fetchJson<{ ceremony: { id: number; status: string } }>(
      `/admin/ceremonies/${ceremonyId}/finalize-winners`,
      { method: "POST" }
    );
    if (!res.ok) {
      setFinalizeStatus({
        ok: false,
        message: res.error ?? "Failed to finalize winners"
      });
      notify({
        id: "admin.ceremony.winners.finalize.error",
        severity: "error",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        title: "Finalize failed",
        message: res.error ?? "Failed to finalize winners"
      });
      return;
    }
    notify({
      id: "admin.ceremony.winners.finalize.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Winners finalized"
    });
    setFinalizeStatus({ ok: true, message: "Finalized" });
    void load();
  }, [ceremonyId, load]);

  const toggleNomination = useCallback(
    (categoryId: number, nominationId: number, checked: boolean) => {
      setSelectedWinner((prev) => {
        const current = prev[categoryId] ?? [];
        const nextSet = new Set(current);
        if (checked) nextSet.add(nominationId);
        else nextSet.delete(nominationId);
        return { ...prev, [categoryId]: Array.from(nextSet) };
      });
    },
    []
  );

  const resetCategory = useCallback(
    (categoryId: number) => {
      setSelectedWinner((prev) => ({
        ...prev,
        [categoryId]: winnerByCategory[categoryId] ?? []
      }));
    },
    [winnerByCategory]
  );

  const confirmPendingWinner = useCallback(() => {
    if (!pendingWinner) return;
    const { categoryId, nominationIds } = pendingWinner;
    setPendingWinner(null);
    void saveWinners(categoryId, nominationIds);
  }, [pendingWinner, saveWinners]);

  return {
    loading,
    loadState,
    groupedNominations,
    selectedWinner,
    toggleNomination,
    resetCategory,
    winnerByCategory,
    winnerStatus,
    savingCategory,
    draftLock,
    ceremonyStatus,
    isDirty,
    nominationLabel: winnersNominationLabel,
    pendingWinner,
    dismissPendingWinner: () => setPendingWinner(null),
    requestSaveWinners,
    confirmPendingWinner,
    pendingSaveAll,
    dismissPendingSaveAll: () => setPendingSaveAll(null),
    requestSaveAll,
    confirmPendingSaveAll,
    pendingFinalize,
    dismissPendingFinalize: () => setPendingFinalize(null),
    requestFinalizeWinners,
    confirmFinalizeWinners,
    finalizeStatus
  };
}

export type AdminCeremonyWinnersOrchestration = ReturnType<
  typeof useAdminCeremonyWinnersOrchestration
>;
