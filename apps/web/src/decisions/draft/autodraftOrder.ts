import type { Snapshot } from "../../lib/types";

export function computeAutodraftNominationIdOrder(args: {
  snapshot: Snapshot | null;
  strategy: "random" | "by_category" | "alphabetical" | "wisdom" | "custom";
  planNominationIds: number[];
  selectedPlanId: number | null;
  scoringStrategyName: string;
  categoryWeightByCategoryId: Map<number, number>;
}) {
  const { snapshot } = args;
  const rows = snapshot?.nominations ?? [];
  if (rows.length === 0) return [];

  const active = rows.filter((n) => n.status === "ACTIVE");

  const catIndex = new Map<number, number>();
  for (const c of snapshot?.categories ?? []) {
    catIndex.set(c.id, c.sort_index ?? 0);
  }

  const canonicalIds = active
    .slice()
    .sort((a, b) => {
      const ai = catIndex.get(a.category_edition_id) ?? 0;
      const bi = catIndex.get(b.category_edition_id) ?? 0;
      if (ai !== bi) return ai - bi;
      return a.id - b.id;
    })
    .map((n) => n.id);

  if (args.strategy === "custom") {
    if (args.planNominationIds.length > 0) return args.planNominationIds;
    if (!args.selectedPlanId) return [];
    return canonicalIds;
  }

  if (args.strategy === "by_category") return canonicalIds;

  if (args.strategy === "alphabetical") {
    const normalize = (raw: string) =>
      raw
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/^(the|a|an)\s+/i, "")
        .trim();
    return active
      .slice()
      .sort((a, b) => {
        const labelA = a.film_title ?? a.performer_name ?? a.song_title ?? "";
        const labelB = b.film_title ?? b.performer_name ?? b.song_title ?? "";
        const na = normalize(labelA);
        const nb = normalize(labelB);
        if (na !== nb) return na.localeCompare(nb);
        const ai = catIndex.get(a.category_edition_id) ?? 0;
        const bi = catIndex.get(b.category_edition_id) ?? 0;
        if (ai !== bi) return ai - bi;
        return a.id - b.id;
      })
      .map((n) => n.id);
  }

  if (args.strategy === "wisdom") {
    const bm = snapshot?.wisdom_benchmark?.items ?? [];
    const sById = new Map<number, number>();
    for (const it of bm) sById.set(it.nomination_id, it.score);

    const fallbackW = args.scoringStrategyName === "negative" ? -1 : 1;
    return active
      .slice()
      .sort((a, b) => {
        const sa = sById.get(a.id) ?? 0;
        const sb = sById.get(b.id) ?? 0;
        const wa =
          args.scoringStrategyName === "category_weighted"
            ? (args.categoryWeightByCategoryId.get(a.category_edition_id) ?? 1)
            : fallbackW;
        const wb =
          args.scoringStrategyName === "category_weighted"
            ? (args.categoryWeightByCategoryId.get(b.category_edition_id) ?? 1)
            : fallbackW;
        const ua = sa * wa;
        const ub = sb * wb;
        if (ua !== ub) return ub - ua;
        const ai = catIndex.get(a.category_edition_id) ?? 0;
        const bi = catIndex.get(b.category_edition_id) ?? 0;
        if (ai !== bi) return ai - bi;
        return a.id - b.id;
      })
      .map((n) => n.id);
  }

  return canonicalIds;
}

