type ReorderableNomination = {
  id: number;
  category_edition_id: number;
  sort_order?: number;
};

type SelectableContributor = { name: string; tmdb_id: number | null };

/** Re-sort nominations after a drag within one category; other categories keep stored order. */
export function reorderNominationsLocally<T extends ReorderableNomination>(
  nominations: T[],
  categoryEditionId: number,
  orderedNominationIds: number[]
): T[] {
  const order = new Map<number, number>();
  for (let i = 0; i < orderedNominationIds.length; i += 1) {
    order.set(orderedNominationIds[i], i);
  }
  return [...nominations].sort((a, b) => {
    if (a.category_edition_id !== b.category_edition_id) {
      return a.category_edition_id - b.category_edition_id;
    }
    if (a.category_edition_id !== categoryEditionId) {
      return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;
    }
    const ao = order.get(a.id);
    const bo = order.get(b.id);
    if (ao === undefined || bo === undefined) {
      return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;
    }
    return ao - bo;
  });
}

export function buildSelectedCredits(contributors: SelectableContributor[]) {
  return contributors
    .filter((c) => typeof c.tmdb_id === "number" && c.tmdb_id > 0)
    .map((c) => ({
      tmdb_id: Number(c.tmdb_id),
      name: c.name,
      jobs: [] as string[]
    }));
}

export function buildCategoryLabelById(
  categories: Array<{ id: number; family_name?: string; family_code?: string }>
) {
  const map: Record<number, string> = {};
  for (const c of categories) {
    map[c.id] = c.family_name ?? c.family_code ?? `Category ${c.id}`;
  }
  return map;
}

export function formatCandidateImportMessage(payload: unknown) {
  const p = payload as
    { upserted?: number; hydrated?: number; tmdb_errors?: unknown[] } | undefined;
  const upserted = typeof p?.upserted === "number" ? p.upserted : undefined;
  const hydrated = typeof p?.hydrated === "number" ? p.hydrated : undefined;
  const tmdbErrorsCount = Array.isArray(p?.tmdb_errors) ? p.tmdb_errors.length : 0;
  return `Loaded candidates${typeof upserted === "number" ? ` (upserted: ${upserted}` : ""}${
    typeof hydrated === "number"
      ? `${typeof upserted === "number" ? ", " : " ("}hydrated from TMDB: ${hydrated}`
      : ""
  }${typeof upserted === "number" || typeof hydrated === "number" ? `)` : ""}${
    tmdbErrorsCount ? `. TMDB errors: ${tmdbErrorsCount}` : ""
  }.`;
}
