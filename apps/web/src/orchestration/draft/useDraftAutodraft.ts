import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../../lib/api";
import type { Snapshot } from "../../lib/types";

export type DraftAutodraftStrategy =
  | "random"
  | "by_category"
  | "alphabetical"
  | "wisdom"
  | "custom";

export function useDraftAutodraft(args: {
  disabled: boolean;
  snapshot: Snapshot | null;
  snapshotRef: React.MutableRefObject<Snapshot | null>;
}) {
  const { disabled, snapshot, snapshotRef } = args;

  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoStrategy, setAutoStrategy] = useState<DraftAutodraftStrategy>("random");
  const [autoPlanId, setAutoPlanId] = useState<number | null>(null);
  const [autoPlans, setAutoPlans] = useState<Array<{ id: number; name: string }>>([]);
  const [autoList, setAutoList] = useState<number[]>([]);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);

  const loadAutodraft = useCallback(async (nextSnapshot?: Snapshot | null) => {
    const s = nextSnapshot ?? snapshotRef.current;
    if (!s?.draft?.id) return;
    const ceremonyId = s.ceremony_id ?? null;
    if (!ceremonyId) return;

    setAutoLoading(true);
    setAutoError(null);

    const [cfgRes, plansRes] = await Promise.all([
      fetchJson<{
        autodraft: { enabled: boolean; strategy: string; plan_id: number | null };
      }>(`/drafts/${s.draft.id}/autodraft`, { method: "GET" }),
      fetchJson<{ plans: Array<{ id: number; name: string }> }>(
        `/draft-plans/ceremonies/${ceremonyId}`,
        { method: "GET" }
      )
    ]);

    if (!plansRes.ok) {
      setAutoPlans([]);
    } else {
      setAutoPlans(plansRes.data?.plans ?? []);
    }

    if (!cfgRes.ok) {
      setAutoError(cfgRes.error ?? "Failed to load auto-draft settings");
      setAutoLoading(false);
      return;
    }

    const cfg = cfgRes.data?.autodraft;
    const enabled = Boolean(cfg?.enabled);
    const strategy = String(cfg?.strategy ?? "RANDOM").toUpperCase();
    const planId = cfg?.plan_id ?? null;

    setAutoEnabled(enabled);
    setAutoStrategy(
      strategy === "PLAN"
        ? "custom"
        : strategy === "BY_CATEGORY"
          ? "by_category"
          : strategy === "ALPHABETICAL"
            ? "alphabetical"
            : strategy === "WISDOM"
              ? "wisdom"
              : "random"
    );
    setAutoPlanId(planId);

    if (enabled && strategy === "PLAN" && planId) {
      const planRes = await fetchJson<{ nomination_ids: number[] }>(
        `/draft-plans/${planId}`,
        { method: "GET" }
      );
      if (planRes.ok) setAutoList(planRes.data?.nomination_ids ?? []);
      else setAutoList([]);
    } else {
      setAutoList([]);
    }

    setAutoLoading(false);
  }, []);

  // Load per-user auto-draft settings once we have the initial snapshot.
  useEffect(() => {
    if (disabled) return;
    if (!snapshot?.draft?.id) return;
    void loadAutodraft(snapshot);
  }, [disabled, loadAutodraft, snapshot?.draft?.id]);

  const updateAutodraft = useCallback(
    async (next: {
      enabled: boolean;
      strategy: DraftAutodraftStrategy;
      planId: number | null;
    }) => {
      const current = snapshotRef.current;
      if (!current?.draft?.id) return false;
      const hasPlans = autoPlans.length > 0;
      const resolvedStrategy = (() => {
        if (next.strategy === "custom")
          return hasPlans ? ("PLAN" as const) : ("RANDOM" as const);
        if (next.strategy === "by_category") return "BY_CATEGORY" as const;
        if (next.strategy === "alphabetical") return "ALPHABETICAL" as const;
        if (next.strategy === "wisdom") return "WISDOM" as const;
        return "RANDOM" as const;
      })();
      const resolvedPlanId =
        next.enabled && resolvedStrategy === "PLAN" ? next.planId : null;

      setAutoSaving(true);
      setAutoError(null);
      const res = await fetchJson<{
        autodraft: { enabled: boolean; strategy: string; plan_id: number | null };
      }>(`/drafts/${current.draft.id}/autodraft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: next.enabled,
          strategy: resolvedStrategy,
          plan_id: resolvedPlanId
        })
      });
      setAutoSaving(false);
      if (!res.ok) {
        setAutoError(res.error ?? "Failed to save auto-draft settings");
        return false;
      }

      setAutoEnabled(Boolean(res.data?.autodraft?.enabled));
      const s = String(res.data?.autodraft?.strategy ?? "RANDOM").toUpperCase();
      setAutoStrategy(
        s === "PLAN"
          ? "custom"
          : s === "BY_CATEGORY"
            ? "by_category"
            : s === "ALPHABETICAL"
              ? "alphabetical"
              : s === "WISDOM"
                ? "wisdom"
                : "random"
      );
      setAutoPlanId(res.data?.autodraft?.plan_id ?? null);

      // Refresh the selected list if a plan was chosen.
      const planId = res.data?.autodraft?.plan_id ?? null;
      if (next.enabled && s === "PLAN" && planId) {
        const planRes = await fetchJson<{ nomination_ids: number[] }>(
          `/draft-plans/${planId}`,
          { method: "GET" }
        );
        if (planRes.ok) setAutoList(planRes.data?.nomination_ids ?? []);
        else setAutoList([]);
      } else {
        setAutoList([]);
      }
      return true;
    },
    [autoPlans.length]
  );

  const setEnabled = useCallback(
    (v: boolean) => {
      const prev = autoEnabled;
      setAutoEnabled(v);
      void (async () => {
        const ok = await updateAutodraft({
          enabled: v,
          strategy: autoStrategy,
          planId: autoPlanId
        });
        if (!ok) setAutoEnabled(prev);
      })();
    },
    [autoEnabled, autoPlanId, autoStrategy, updateAutodraft]
  );

  const setStrategy = useCallback(
    (v: DraftAutodraftStrategy) => {
      const prev = autoStrategy;
      setAutoStrategy(v);
      // Allow configuring strategy pre-draft without forcing enablement.
      if (!autoEnabled) return;
      void (async () => {
        const ok = await updateAutodraft({
          enabled: autoEnabled,
          strategy: v,
          planId: autoPlanId
        });
        if (!ok) setAutoStrategy(prev);
      })();
    },
    [autoEnabled, autoPlanId, autoStrategy, updateAutodraft]
  );

  const setSelectedPlanId = useCallback(
    (v: number | null) => {
      const prev = autoPlanId;
      setAutoPlanId(v);
      // Allow selecting a plan pre-draft without forcing enablement.
      if (!autoEnabled) {
        if (!v) {
          setAutoList([]);
          return;
        }
        void (async () => {
          const planRes = await fetchJson<{ nomination_ids: number[] }>(
            `/draft-plans/${v}`,
            {
              method: "GET"
            }
          );
          if (planRes.ok) setAutoList(planRes.data?.nomination_ids ?? []);
          else setAutoList([]);
        })();
        return;
      }
      void (async () => {
        const ok = await updateAutodraft({
          enabled: autoEnabled,
          strategy: autoStrategy,
          planId: v
        });
        if (!ok) setAutoPlanId(prev);
      })();
    },
    [autoEnabled, autoPlanId, autoStrategy, updateAutodraft]
  );

  // Only used for UI gating (disable "Custom" if there are no available plans).
  const hasPlans = useMemo(() => autoPlans.length > 0, [autoPlans.length]);

  return {
    enabled: autoEnabled,
    setEnabled,
    strategy: autoStrategy,
    setStrategy,
    plans: autoPlans,
    hasPlans,
    selectedPlanId: autoPlanId,
    setSelectedPlanId,
    planNominationIds: autoList,
    loading: autoLoading,
    saving: autoSaving,
    error: autoError,
    reload: loadAutodraft
  };
}
