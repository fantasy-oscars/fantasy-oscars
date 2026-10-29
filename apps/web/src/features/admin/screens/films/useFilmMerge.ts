import { useMemo, useState } from "react";
import {
  findInitialMergeConflict,
  planConflictResolution,
  resolveMergeConflictFromError,
  sortSelectedFilms,
  toggleRowSelection,
  type FilmDisplayRow
} from "@/decisions/films/filmGroups";
import type { AdminFilmRow } from "@/orchestration/admin/filmsIndex/orchestration";

type MergeResult = {
  ok: boolean;
  errorCode?: string;
  errorDetails?: Record<string, unknown>;
};

type MergeConflict = {
  selectedFilms: AdminFilmRow[];
  linkedFilms: AdminFilmRow[];
  keepLinkedId: string;
};

/** Screen-level state for multi-select, merging, and TMDB link conflict resolution. */
export function useFilmMerge(args: {
  onMergeSelected: (films: AdminFilmRow[]) => Promise<MergeResult>;
  onSaveTmdbId: (filmId: number, tmdbId: number | null) => Promise<{ ok: boolean }>;
}) {
  const { onMergeSelected, onSaveTmdbId } = args;

  const [selectedFilmById, setSelectedFilmById] = useState<Record<number, AdminFilmRow>>(
    {}
  );
  const [mergingSelected, setMergingSelected] = useState(false);
  const [mergeConflict, setMergeConflict] = useState<MergeConflict | null>(null);
  const [resolvingConflict, setResolvingConflict] = useState(false);

  const selectedFilms = useMemo(
    () => sortSelectedFilms(selectedFilmById),
    [selectedFilmById]
  );

  const toggleRow = (row: FilmDisplayRow<AdminFilmRow>, checked: boolean) => {
    setSelectedFilmById((prev) => toggleRowSelection(prev, row, checked));
  };

  const tryMergeSelected = (filmsToMerge: AdminFilmRow[]) => {
    if (filmsToMerge.length < 2) return;
    const conflict = findInitialMergeConflict(filmsToMerge);
    if (conflict) {
      setMergeConflict(conflict);
      return;
    }
    setMergingSelected(true);
    void onMergeSelected(filmsToMerge).then((res) => {
      setMergingSelected(false);
      if (!res.ok) {
        if (
          res.errorCode === "FILM_MERGE_LINK_CONFLICT" &&
          Array.isArray(res.errorDetails?.linked_films)
        ) {
          const fromError = resolveMergeConflictFromError(
            filmsToMerge,
            res.errorDetails?.linked_films as Array<{ id?: unknown }>
          );
          if (fromError) setMergeConflict(fromError);
        }
        return;
      }
      setSelectedFilmById({});
    });
  };

  const closeConflict = () => {
    if (resolvingConflict) return;
    setMergeConflict(null);
  };

  const cancelConflict = () => setMergeConflict(null);

  const setKeepLinkedId = (value: string) => {
    setMergeConflict((prev) => (prev ? { ...prev, keepLinkedId: value } : prev));
  };

  const resolveConflict = () => {
    if (!mergeConflict?.keepLinkedId) return;
    const { toUnlink, nextSelected } = planConflictResolution(mergeConflict);
    setResolvingConflict(true);
    void (async () => {
      for (const film of toUnlink) {
        const unlink = await onSaveTmdbId(film.id, null);
        if (!unlink.ok) {
          setResolvingConflict(false);
          return;
        }
      }
      const merged = await onMergeSelected(nextSelected);
      setResolvingConflict(false);
      if (!merged.ok) return;
      setSelectedFilmById({});
      setMergeConflict(null);
    })();
  };

  return {
    selectedFilmById,
    selectedFilms,
    mergingSelected,
    mergeConflict,
    resolvingConflict,
    toggleRow,
    tryMergeSelected,
    closeConflict,
    cancelConflict,
    setKeepLinkedId,
    resolveConflict
  };
}
