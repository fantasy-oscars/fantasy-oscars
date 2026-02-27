import { useCallback, useEffect, useMemo, useState } from "react";
import { notify } from "../../../notifications";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import { winnersNominationLabel } from "../../../decisions/admin/winnersNominationLabel";
import type { WinnersNominationRow } from "./winners/types";

export function useAdminCeremonyWinnersOrchestration(args: {
  ceremonyId: number | null;
  onAfterFinalize?: (() => void | Promise<void>) | null;
}) {
  const { ceremonyId } = args;
  const onAfterFinalize = args.onAfterFinalize ?? null;

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
    setCeremonyStatus((prev) => (prev === "COMPLETE" ? prev : "LOCKED"));
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
    await load();
    await onAfterFinalize?.();
  }, [ceremonyId, load, onAfterFinalize]);

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
