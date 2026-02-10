import { includesNormalized, normalizeForSearch } from "@fantasy-oscars/shared";

export type DraftPlanCategory = { id: number; sort_index: number };
export type DraftPlanNomination = { id: number; category_edition_id: number };

export function filterDraftPlansByName<T extends { name: string }>(
  plans: T[],
  query: string
): T[] {
  const q = normalizeForSearch(query);
  return plans.filter((p) => includesNormalized(p.name, q));
}

// Default: category order, then nominee order (stable by input order).
export function computeDefaultNominationIdsForDraftPlan(args: {
  categories: DraftPlanCategory[];
  nominations: DraftPlanNomination[];
}): number[] {
  const categoryIndex = new Map<number, number>();
  args.categories
    .slice()
    .sort((a, b) => a.sort_index - b.sort_index || a.id - b.id)
    .forEach((c, idx) => categoryIndex.set(c.id, idx));

  return args.nominations
    .map((n, idx) => ({ n, idx }))
    .sort((a, b) => {
      const ca = categoryIndex.get(a.n.category_edition_id) ?? 9999;
      const cb = categoryIndex.get(b.n.category_edition_id) ?? 9999;
      if (ca !== cb) return ca - cb;
      return a.idx - b.idx;
    })
    .map((x) => x.n.id);
}

export function computeEffectiveNomineeOrderForDraftPlan(args: {
  selectedPlanId: number | null;
  planOrder: number[];
  defaultOrder: number[];
  nominations: Array<{ id: number }>;
}): number[] {
  if (!args.selectedPlanId) return [];

  const fromPlan = args.planOrder.length > 0 ? args.planOrder : args.defaultOrder;

  const all = new Set(args.nominations.map((n) => n.id));
  const seen = new Set<number>();
  const ordered = fromPlan.filter((id) => {
    if (!all.has(id)) return false;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  // Append any new nominations not yet in the plan, in default order.
  for (const id of args.defaultOrder) {
    if (!seen.has(id)) ordered.push(id);
  }
  return ordered;
}

