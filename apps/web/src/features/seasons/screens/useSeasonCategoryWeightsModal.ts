import { useCallback, useState } from "react";

export function useSeasonCategoryWeightsModal(args: {
  ceremonyId: number | null;
  getCeremonyCategoriesForWeights: (
    ceremonyId: number
  ) => Promise<
    | { ok: true; categories: Array<{ id: number; family_name: string; sort_index: number | null }> }
    | { ok: false; error?: string }
  >;
  existingWeights: unknown;
}) {
  const { ceremonyId, getCeremonyCategoriesForWeights, existingWeights } = args;

  const [weightsOpen, setWeightsOpen] = useState(false);
  const [weightsLoading, setWeightsLoading] = useState(false);
  const [weightsError, setWeightsError] = useState<string | null>(null);
  const [weightsCats, setWeightsCats] = useState<Array<{ id: number; name: string }>>([]);
  const [weightsDraft, setWeightsDraft] = useState<Record<string, number>>({});

  const openWeightsModal = useCallback(async () => {
    if (!ceremonyId) return;
    setWeightsError(null);
    setWeightsLoading(true);
    const res = await getCeremonyCategoriesForWeights(ceremonyId);
    setWeightsLoading(false);
    if (!res.ok) {
      setWeightsError(res.error ?? "Unable to load categories");
      setWeightsCats([]);
      setWeightsDraft({});
      setWeightsOpen(true);
      return;
    }

    const cats = (res.categories ?? [])
      .slice()
      .sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0))
      .map((c) => ({ id: c.id, name: c.family_name }));

    const existing =
      (existingWeights && typeof existingWeights === "object"
        ? (existingWeights as Record<string, unknown>)
        : null) ?? null;

    const nextWeights: Record<string, number> = {};
    for (const c of cats) {
      const v = existing?.[String(c.id)];
      nextWeights[String(c.id)] = typeof v === "number" && Number.isInteger(v) ? v : 1;
    }

    setWeightsCats(cats);
    setWeightsDraft(nextWeights);
    setWeightsOpen(true);
  }, [ceremonyId, existingWeights, getCeremonyCategoriesForWeights]);

  return {
    weightsOpen,
    setWeightsOpen,
    weightsLoading,
    weightsError,
    weightsCats,
    weightsDraft,
    setWeightsDraft,
    openWeightsModal
  };
}

