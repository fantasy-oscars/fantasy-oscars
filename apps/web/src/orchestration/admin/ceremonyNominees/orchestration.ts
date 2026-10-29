import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import { buildCategoryLabelById } from "../../../decisions/admin/nomineeLists";
import type { CandidateFilm, CeremonyCategory } from "./types";
import {
  fetchAllFilms,
  getFilmCreditsRaw,
  patchFilmTmdbId,
  patchPersonTmdbId
} from "./actions";
import { useCandidateUpload } from "./useCandidateUpload";
import { usePeopleSearch } from "./usePeopleSearch";
import { useNomineeFilmEntry } from "./useNomineeFilmEntry";
import { useCeremonyNominations } from "./useCeremonyNominations";

export function useAdminCeremonyNomineesOrchestration(args: {
  ceremonyId: number | null;
  onWorksheetChange?: (() => void | Promise<void>) | null;
}) {
  const ceremonyId = args.ceremonyId;
  const onWorksheetChange = args.onWorksheetChange ?? null;

  const [tab, setTab] = useState<"candidates" | "add" | "list">("candidates");

  const [manualLoading, setManualLoading] = useState(false);
  const [manualState, setManualState] = useState<ApiResult | null>(null);
  const [categories, setCategories] = useState<CeremonyCategory[]>([]);
  const [films, setFilms] = useState<CandidateFilm[]>([]);

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId]
  );
  const [songTitle, setSongTitle] = useState("");

  const {
    onCandidateFile,
    onCandidateFileChange,
    resetCandidates,
    uploadCandidateFilms,
    ...candidateState
  } = useCandidateUpload(ceremonyId);
  const { searchPeople, ...peopleState } = usePeopleSearch();
  const {
    resetFilmEntry,
    resolveFilmSelection,
    selectFilmFromPicker,
    createUnlinkedFilmFromInput,
    selectTmdbFilmCandidate,
    ...filmEntryState
  } = useNomineeFilmEntry({
    films,
    setFilms,
    setManualLoading,
    setManualState
  });
  const {
    loadNominations,
    deleteNomination,
    reorderNominationsInCategory,
    addNominationContributor,
    removeNominationContributor,
    updateNominationContributorDisplay,
    ...nominationState
  } = useCeremonyNominations({
    ceremonyId,
    active: tab === "list",
    onWorksheetChange,
    setManualLoading,
    setManualState
  });
  const { selectedFilmId, filmTitleFallback, selectedContributors } = filmEntryState;

  const loadManualContext = useCallback(async () => {
    if (ceremonyId === null || !Number.isFinite(ceremonyId) || ceremonyId <= 0) return;
    setManualLoading(true);
    setManualState(null);
    const [catsRes, filmsRes] = await Promise.all([
      fetchJson<{ categories: CeremonyCategory[] }>(
        `/admin/ceremonies/${ceremonyId}/categories`,
        {
          method: "GET"
        }
      ),
      fetchAllFilms()
    ]);
    if (!catsRes.ok || !filmsRes.ok) {
      setManualState({
        ok: false,
        message:
          catsRes.error ??
          (filmsRes.ok ? undefined : filmsRes.error) ??
          "Failed to load ceremony context"
      });
      setManualLoading(false);
      return;
    }
    setCategories(catsRes.data?.categories ?? []);
    setFilms(filmsRes.films);
    setManualLoading(false);
  }, [ceremonyId]);

  useEffect(() => {
    void loadManualContext();
  }, [loadManualContext]);

  const resetManual = useCallback(() => {
    setManualState(null);
    setSelectedCategoryId(null);
    setSongTitle("");
    resetFilmEntry();
  }, [resetFilmEntry]);

  const categoryLabelById = useMemo(
    () => buildCategoryLabelById(categories),
    [categories]
  );

  const createNomination = useCallback(async () => {
    if (ceremonyId === null || !Number.isFinite(ceremonyId) || ceremonyId <= 0) {
      setManualState({ ok: false, message: "Invalid ceremony id." });
      return;
    }
    if (!selectedCategoryId) {
      setManualState({ ok: false, message: "Select a category first." });
      return;
    }
    if (!selectedFilmId && !filmTitleFallback.trim()) {
      setManualState({ ok: false, message: "Select a film (or type a new film title)." });
      return;
    }
    if (selectedCategory?.unit_kind === "SONG" && !songTitle.trim()) {
      setManualState({
        ok: false,
        message: "Song title is required for song categories."
      });
      return;
    }
    if (
      selectedCategory?.unit_kind === "PERFORMANCE" &&
      selectedContributors.length < 1
    ) {
      setManualState({
        ok: false,
        message: "Performance categories require at least one contributor."
      });
      return;
    }

    setManualLoading(true);
    setManualState(null);
    const res = await fetchJson<{ nomination_id: number; film_id?: number | null }>(
      `/admin/ceremonies/${ceremonyId}/nominations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_edition_id: selectedCategoryId,
          film_id: selectedFilmId ?? undefined,
          film_title: selectedFilmId ? undefined : filmTitleFallback.trim(),
          song_title:
            selectedCategory?.unit_kind === "SONG" ? songTitle.trim() : undefined,
          contributors: selectedContributors.map((c) => ({
            tmdb_id: c.tmdb_id ?? undefined,
            name: c.name
          }))
        })
      }
    );
    setManualLoading(false);
    if (!res.ok) {
      setManualState({ ok: false, message: res.error ?? "Failed to create nomination" });
      return;
    }
    setManualState({
      ok: true,
      message: `Created nomination #${res.data?.nomination_id ?? "?"}`
    });
    // Keep category for fast entry; clear everything else.
    resetFilmEntry();
    setSongTitle("");
    void Promise.all([loadManualContext(), loadNominations()]);
    void onWorksheetChange?.();
  }, [
    ceremonyId,
    filmTitleFallback,
    loadManualContext,
    loadNominations,
    onWorksheetChange,
    resetFilmEntry,
    selectedCategory?.unit_kind,
    selectedCategoryId,
    selectedContributors,
    selectedFilmId,
    songTitle
  ]);

  const linkFilmTmdb = useCallback(
    async (filmId: number, tmdbId: number | null) => {
      setManualLoading(true);
      const res = await patchFilmTmdbId(filmId, tmdbId);
      setManualLoading(false);
      if (!res.ok) {
        return {
          ok: false as const,
          hydrated: false,
          error: res.error ?? "Failed to link film",
          errorCode: res.errorCode,
          errorDetails: res.errorDetails
        };
      }
      await Promise.all([loadManualContext(), loadNominations()]);
      return { ok: true as const, hydrated: Boolean(res.data?.hydrated) };
    },
    [loadManualContext, loadNominations]
  );

  const linkPersonTmdb = useCallback(
    async (personId: number, tmdbId: number | null) => {
      setManualLoading(true);
      const res = await patchPersonTmdbId(personId, tmdbId);
      setManualLoading(false);
      if (!res.ok) {
        return {
          ok: false as const,
          hydrated: false,
          error: res.error ?? "Failed to link person",
          errorCode: res.errorCode,
          errorDetails: res.errorDetails
        };
      }
      await Promise.all([loadManualContext(), loadNominations()]);
      return { ok: true as const, hydrated: Boolean(res.data?.hydrated) };
    },
    [loadManualContext, loadNominations]
  );

  const getFilmCredits = useCallback(async (filmId: number) => {
    if (!Number.isFinite(filmId) || filmId <= 0) return null;
    const res = await getFilmCreditsRaw(filmId);
    if (!res.ok) return null;
    const creditsUnknown = res.data?.credits ?? null;
    return creditsUnknown && typeof creditsUnknown === "object" ? creditsUnknown : null;
  }, []);

  return {
    ceremonyId,
    tab,
    setTab,

    ...candidateState,

    manualLoading,
    manualState,

    categories,
    films,
    ...nominationState,

    ...peopleState,

    selectedCategoryId,
    setSelectedCategoryId,
    selectedCategory,
    categoryLabelById,

    songTitle,
    setSongTitle,

    ...filmEntryState,

    actions: {
      getFilmCredits,
      loadManualContext,
      searchPeople,
      resolveFilmSelection,
      selectFilmFromPicker,
      selectTmdbFilmCandidate,
      createUnlinkedFilmFromInput,
      onCandidateFile,
      onCandidateFileChange,
      resetCandidates,
      resetManual,
      uploadCandidateFilms,
      loadNominations,
      deleteNomination,
      reorderNominationsInCategory,
      createNomination,
      linkFilmTmdb,
      linkPersonTmdb,
      addNominationContributor,
      removeNominationContributor,
      updateNominationContributorDisplay
    }
  };
}

export type AdminCeremonyNomineesOrchestration = ReturnType<
  typeof useAdminCeremonyNomineesOrchestration
>;
