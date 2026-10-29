/** Pure rules for the admin films index: duplicate grouping, row selection and merge planning. */

export type FilmGroupRowBase = {
  id: number;
  title: string;
  release_year: number | null;
  tmdb_id: number | null;
  is_nominated: boolean;
  norm_title: string;
};

export type ConsolidatedGroup<T extends FilmGroupRowBase> = {
  normTitle: string;
  films: T[];
};

export type FilmDisplayRow<T extends FilmGroupRowBase> =
  | { type: "film"; film: T }
  | { type: "group"; group: ConsolidatedGroup<T>; representative: T };

export const GROUP_PAGE_SIZE = 8;

export function countActiveFilters(filters: {
  year: string;
  linked: string;
  nominated: string;
}) {
  let count = 0;
  if (filters.year !== "all") count += 1;
  if (filters.linked !== "all") count += 1;
  if (filters.nominated !== "all") count += 1;
  return count;
}

export function groupFilmsByNormTitle<T extends FilmGroupRowBase>(films: T[]) {
  const grouped = new Map<string, T[]>();
  for (const film of films) {
    const key = film.norm_title || String(film.id);
    const existing = grouped.get(key);
    if (existing) existing.push(film);
    else grouped.set(key, [film]);
  }
  return grouped;
}

export function buildFilmDisplayRows<T extends FilmGroupRowBase>(
  groupsByNormTitle: Map<string, T[]>,
  decoupledFilmIds: Record<number, true>
): FilmDisplayRow<T>[] {
  const rows: FilmDisplayRow<T>[] = [];
  for (const films of groupsByNormTitle.values()) {
    const decoupled = films.filter((f) => decoupledFilmIds[f.id]);
    const coupled = films.filter((f) => !decoupledFilmIds[f.id]);

    for (const film of decoupled) rows.push({ type: "film", film });
    if (coupled.length === 1) {
      rows.push({ type: "film", film: coupled[0] });
      continue;
    }
    if (coupled.length > 1) {
      const representative =
        coupled.find((f) => Boolean(f.tmdb_id)) ??
        coupled.find((f) => f.is_nominated) ??
        coupled[0];
      rows.push({
        type: "group",
        group: {
          normTitle: coupled[0]?.norm_title ?? String(coupled[0]?.id ?? ""),
          films: coupled
        },
        representative
      });
    }
  }
  return rows;
}

export function findOpenGroup<T extends FilmGroupRowBase>(
  displayRows: FilmDisplayRow<T>[],
  openGroupKey: string | null
): ConsolidatedGroup<T> | null {
  if (!openGroupKey) return null;
  const row = displayRows.find(
    (entry): entry is Extract<FilmDisplayRow<T>, { type: "group" }> =>
      entry.type === "group" && entry.group.normTitle === openGroupKey
  );
  return row?.group ?? null;
}

export function pageGroupFilms<T>(films: T[], page: number) {
  const pageCount = Math.max(1, Math.ceil(films.length / GROUP_PAGE_SIZE));
  const clampedPage = Math.min(Math.max(page, 1), pageCount);
  const start = (clampedPage - 1) * GROUP_PAGE_SIZE;
  return {
    pageCount,
    clampedPage,
    pageFilms: films.slice(start, start + GROUP_PAGE_SIZE)
  };
}

export function sortSelectedFilms<T extends FilmGroupRowBase>(
  selectedFilmById: Record<number, T>
) {
  return Object.values(selectedFilmById).sort((a, b) =>
    `${a.title}${a.release_year ?? ""}`.localeCompare(`${b.title}${b.release_year ?? ""}`)
  );
}

export function computeTotalPages(total: number, pageSize: number) {
  return Math.max(1, Math.ceil((total || 0) / Math.max(pageSize, 1)));
}

export function isRowChecked<T extends FilmGroupRowBase>(
  row: FilmDisplayRow<T>,
  selectedFilmById: Record<number, T>
) {
  const film = row.type === "film" ? row.film : row.representative;
  return row.type === "group"
    ? row.group.films.every((groupFilm) => Boolean(selectedFilmById[groupFilm.id]))
    : Boolean(selectedFilmById[film.id]);
}

export function isRowIndeterminate<T extends FilmGroupRowBase>(
  row: FilmDisplayRow<T>,
  selectedFilmById: Record<number, T>
) {
  return row.type === "group"
    ? row.group.films.some((groupFilm) => Boolean(selectedFilmById[groupFilm.id])) &&
        !row.group.films.every((groupFilm) => Boolean(selectedFilmById[groupFilm.id]))
    : false;
}

export function selectDisplayRowsWithSelection<T extends FilmGroupRowBase>(
  displayRows: FilmDisplayRow<T>[],
  selectedFilmById: Record<number, T>
) {
  return displayRows.filter(
    (row) =>
      isRowChecked(row, selectedFilmById) || isRowIndeterminate(row, selectedFilmById)
  );
}

export function toggleRowSelection<T extends FilmGroupRowBase>(
  selectedFilmById: Record<number, T>,
  row: FilmDisplayRow<T>,
  checked: boolean
) {
  const film = row.type === "film" ? row.film : row.representative;
  const next = { ...selectedFilmById };
  if (row.type === "group") {
    for (const groupFilm of row.group.films) {
      if (checked) next[groupFilm.id] = groupFilm;
      else delete next[groupFilm.id];
    }
    return next;
  }
  if (checked) next[film.id] = film;
  else delete next[film.id];
  return next;
}

export function isTmdbLinked(film: { tmdb_id: number | null }) {
  return Number.isInteger(film.tmdb_id) && Number(film.tmdb_id) > 0;
}

/** Films that must be unlinked (all but one) before a merge can proceed; null when none. */
export function findInitialMergeConflict<T extends FilmGroupRowBase>(
  filmsToMerge: T[]
): { selectedFilms: T[]; linkedFilms: T[]; keepLinkedId: string } | null {
  const linkedFilms = filmsToMerge.filter(isTmdbLinked);
  if (linkedFilms.length <= 1) return null;
  return {
    selectedFilms: filmsToMerge,
    linkedFilms,
    keepLinkedId: String(linkedFilms[0]?.id ?? "")
  };
}

/** Rebuild the conflict from a server FILM_MERGE_LINK_CONFLICT response; null if unresolvable. */
export function resolveMergeConflictFromError<T extends FilmGroupRowBase>(
  filmsToMerge: T[],
  errorLinkedFilms: Array<{ id?: unknown }>
): { selectedFilms: T[]; linkedFilms: T[]; keepLinkedId: string } | null {
  const linkedById = new Map(
    filmsToMerge.filter(isTmdbLinked).map((film) => [film.id, film] as const)
  );
  const linkedFilmsFromError = errorLinkedFilms
    .map((f) => linkedById.get(Number(f.id)))
    .filter((f): f is T => Boolean(f));
  const linkedFilmsResolved =
    linkedFilmsFromError.length > 1
      ? linkedFilmsFromError
      : filmsToMerge.filter(isTmdbLinked);
  if (linkedFilmsResolved.length <= 1) return null;
  return {
    selectedFilms: filmsToMerge,
    linkedFilms: linkedFilmsResolved,
    keepLinkedId: String(linkedFilmsResolved[0]?.id ?? "")
  };
}

/** Films to unlink and the merge set (with those films' links cleared) for a chosen keeper. */
export function planConflictResolution<T extends FilmGroupRowBase>(conflict: {
  selectedFilms: T[];
  linkedFilms: T[];
  keepLinkedId: string;
}) {
  const keepId = Number(conflict.keepLinkedId);
  const toUnlink = conflict.linkedFilms.filter((film) => film.id !== keepId);
  const nextSelected = conflict.selectedFilms.map((film) =>
    toUnlink.some((u) => u.id === film.id) ? { ...film, tmdb_id: null } : film
  );
  return { toUnlink, nextSelected };
}

/** Parse the TMDB id field; `valid: false` when non-empty but not a positive integer. */
export function parseTmdbIdInput(
  input: string
): { valid: true; tmdbId: number | null } | { valid: false } {
  const trimmed = input.trim();
  const tmdbId = trimmed ? Number(trimmed) : null;
  if (tmdbId !== null && (!Number.isInteger(tmdbId) || tmdbId <= 0)) {
    return { valid: false };
  }
  return { valid: true, tmdbId };
}

/** Debounced TMDB search is only meaningful for a real title query, not a bare id. */
export function isSearchableTmdbQuery(q: string) {
  const trimmed = q.trim();
  return Boolean(trimmed) && trimmed.length >= 2 && !/^[0-9]+$/.test(trimmed);
}
