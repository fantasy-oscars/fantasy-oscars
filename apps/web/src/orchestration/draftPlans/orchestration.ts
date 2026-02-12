import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "../../lib/api";

export type DraftPlanSummary = { id: number; name: string; updated_at?: string };

export type DraftPlanDetail = {
  plan: { id: number; ceremony_id: number; name: string };
  nomination_ids: number[];
};

type LoadState = "loading" | "error" | "ready";

export function useDraftPlansOrchestration(args: { ceremonyId: number | null }) {
  const { ceremonyId } = args;
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);

  const [plans, setPlans] = useState<DraftPlanSummary[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [selectedPlanName, setSelectedPlanName] = useState<string | null>(null);
  const [order, setOrder] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const hasRenderedRef = useRef(false);
  useEffect(() => {
    if (state === "ready") hasRenderedRef.current = true;
  }, [state]);

  const refreshPlans = useCallback(async () => {
    if (!ceremonyId) return;
    // Global refresh policy: keep the current screen visible while refreshing.
    const canRefreshInPlace = hasRenderedRef.current;
    if (!canRefreshInPlace) setState("loading");
    setError(null);
    const res = await fetchJson<{ plans: DraftPlanSummary[] }>(
      `/draft-plans/ceremonies/${ceremonyId}`,
      { method: "GET" }
    );
    if (!res.ok) {
      setError(res.error ?? "Failed to load draft plans");
      if (!canRefreshInPlace) {
        setPlans([]);
        setState("error");
      }
      return;
    }
    setPlans(res.data?.plans ?? []);
    setState("ready");
  }, [ceremonyId]);

  useEffect(() => {
    if (!ceremonyId) {
      setState("error");
      setError("Invalid ceremony id");
      return;
    }
    void refreshPlans();
  }, [ceremonyId, refreshPlans]);

  const loadPlan = useCallback(async (planId: number) => {
    if (!planId) return false;
    setSaving(false);
    const res = await fetchJson<DraftPlanDetail>(`/draft-plans/${planId}`, {
      method: "GET"
    });
    if (!res.ok || !res.data?.plan) {
      setError(res.error ?? "Failed to load draft plan");
      return false;
    }
    setSelectedPlanId(res.data.plan.id);
    setSelectedPlanName(res.data.plan.name);
    setOrder(res.data.nomination_ids ?? []);
    return true;
  }, []);

  const createPlan = useCallback(
    async (name: string) => {
      if (!ceremonyId) return false;
      const trimmed = name.trim();
      if (!trimmed) return false;
      setSaving(true);
      const res = await fetchJson<{
        plan: { id: number; name: string };
        nomination_ids: number[];
      }>(`/draft-plans/ceremonies/${ceremonyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed })
      });
      setSaving(false);
      if (!res.ok || !res.data?.plan?.id) {
        setError(res.error ?? "Failed to create plan");
        return false;
      }
      // Refresh list and select the created plan.
      await refreshPlans();
      setSelectedPlanId(res.data.plan.id);
      setSelectedPlanName(res.data.plan.name);
      setOrder(res.data.nomination_ids ?? []);
      return true;
    },
    [ceremonyId, refreshPlans]
  );

  const saveOrder = useCallback(async (planId: number, nominationIds: number[]) => {
    if (!planId) return false;
    setSaving(true);
    const res = await fetchJson(`/draft-plans/${planId}/items`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nomination_ids: nominationIds })
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "Failed to save order");
      return false;
    }
    return true;
  }, []);

  const selectedPlan = useMemo(
    () => (selectedPlanId ? (plans.find((p) => p.id === selectedPlanId) ?? null) : null),
    [plans, selectedPlanId]
  );

  return {
    state,
    error,
    plans,
    selectedPlanId,
    selectedPlanName,
    selectedPlan,
    order,
    saving,
    setSelectedPlanId,
    setSelectedPlanName,
    loadPlan,
    createPlan,
    setOrder,
    saveOrder,
    refreshPlans
  };
}
