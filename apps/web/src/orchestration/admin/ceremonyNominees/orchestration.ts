import { useCallback, useEffect, useMemo, useState } from "react";
import { readJsonFile } from "../../../lib/files";
import { fetchJson } from "../../../lib/api";
import { parseFilmTitleWithYear } from "../../../lib/films";
import type { ApiResult } from "../../../lib/types";
import {
  buildCreditByPersonId,
  buildCreditOptionById,
  buildCreditOptions,
  filterCreditOptions,
  type CreditOption,
  type FilmCredits
} from "../../../decisions/admin/nomineeCredits";
import { summarizeCandidateDataset } from "../../../decisions/admin/candidateDatasetSummary";
import type {
  CandidateFilm,
  CeremonyCategory,
  NominationRow,
  PersonSearchRow
} from "./types";
import {
  deleteNominationContributor as deleteNominationContributorReq,
  getFilmCreditsRaw,
  patchFilmTmdbId,
  patchPersonTmdbId,
  postNominationContributor as postNominationContributorReq
} from "./actions";

export function useAdminCeremonyNomineesOrchestration(args: {
  ceremonyId: number | null;
  onWorksheetChange?: (() => void | Promise<void>) | null;
}) {
  const ceremonyId = args.ceremonyId;
  const onWorksheetChange = args.onWorksheetChange ?? null;

  const [tab, setTab] = useState<"candidates" | "add" | "list">("candidates");

  const [candidateUploading, setCandidateUploading] = useState(false);
  const [candidateUploadState, setCandidateUploadState] = useState<ApiResult | null>(
    null
  );
  const [candidateDataset, setCandidateDataset] = useState<unknown | null>(null);
  const [candidateSummary, setCandidateSummary] = useState<{ films: number } | null>(
    null
  );

  const [manualLoading, setManualLoading] = useState(false);
  const [manualState, setManualState] = useState<ApiResult | null>(null);
  const [categories, setCategories] = useState<CeremonyCategory[]>([]);
  const [films, setFilms] = useState<CandidateFilm[]>([]);
  const [nominations, setNominations] = useState<NominationRow[]>([]);
  const [nominationsLoading, setNominationsLoading] = useState(false);
  const [nominationsState, setNominationsState] = useState<ApiResult | null>(null);

  const [peopleQuery, setPeopleQuery] = useState("");
  const [peopleResults, setPeopleResults] = useState<PersonSearchRow[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleState, setPeopleState] = useState<ApiResult | null>(null);

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId]
  );

  const [filmInput, setFilmInput] = useState("");
  const [selectedFilmId, setSelectedFilmId] = useState<number | null>(null);
  const [filmTitleFallback, setFilmTitleFallback] = useState("");

  const [songTitle, setSongTitle] = useState("");
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsState, setCreditsState] = useState<ApiResult | null>(null);
  const [credits, setCredits] = useState<FilmCredits | null>(null);
  const [selectedContributorIds, setSelectedContributorIds] = useState<number[]>([]);
  const [pendingContributorId, setPendingContributorId] = useState<string>("");
  const [creditQuery, setCreditQuery] = useState("");

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
      fetchJson<{ films: CandidateFilm[] }>(`/admin/films`, {
        method: "GET"
      })
    ]);
    if (!catsRes.ok || !filmsRes.ok) {
      setManualState({
        ok: false,
        message: catsRes.error ?? filmsRes.error ?? "Failed to load ceremony context"
      });
      setManualLoading(false);
      return;
    }
    setCategories(catsRes.data?.categories ?? []);
    setFilms(filmsRes.data?.films ?? []);
    setManualLoading(false);
  }, [ceremonyId]);

  useEffect(() => {
    void loadManualContext();
  }, [loadManualContext]);

  const searchPeople = useCallback(async () => {
    const q = peopleQuery.trim();
    setPeopleLoading(true);
    setPeopleState(null);
    const res = await fetchJson<{
      people: Array<{
        id: number;
        full_name: string;
        tmdb_id: number | null;
        profile_url?: string | null;
      }>;
    }>(q ? `/admin/people?q=${encodeURIComponent(q)}` : `/admin/people`, {
      method: "GET"
    });
    setPeopleLoading(false);
    if (!res.ok) {
      setPeopleResults([]);
      setPeopleState({ ok: false, message: res.error ?? "Failed to load people" });
      return;
    }
    setPeopleResults(res.data?.people ?? []);
    setPeopleState({ ok: true, message: "Loaded" });
  }, [peopleQuery]);

  useEffect(() => {
    void searchPeople();
  }, [searchPeople]);

  const creditByPersonId = useMemo(() => {
    return buildCreditByPersonId(credits);
  }, [credits]);

  const creditOptions = useMemo<CreditOption[]>(() => {
    return buildCreditOptions(creditByPersonId);
  }, [creditByPersonId]);

  const creditOptionById = useMemo(() => {
    return buildCreditOptionById(creditOptions);
  }, [creditOptions]);

  const selectedCredits = useMemo(() => {
    return selectedContributorIds
      .map((id) => creditOptionById[id])
      .filter((v): v is CreditOption => Boolean(v));
  }, [creditOptionById, selectedContributorIds]);

  const filteredCreditOptions = useMemo(() => {
    return filterCreditOptions(creditOptions, creditQuery);
  }, [creditOptions, creditQuery]);

  const resolveFilmSelection = useCallback(
    async (value: string) => {
      setFilmInput(value);
      setCredits(null);
      setCreditsState(null);
      setSelectedContributorIds([]);
      setPendingContributorId("");
      setCreditQuery("");

      const trimmed = value.trim();
      if (!trimmed) {
        setSelectedFilmId(null);
        setFilmTitleFallback("");
        return;
      }

      // Numeric input -> treat as id.
      if (/^[0-9]+$/.test(trimmed)) {
        const id = Number(trimmed);
        if (Number.isFinite(id) && id > 0) {
          setSelectedFilmId(id);
          setFilmTitleFallback("");
          setCreditsLoading(true);
          const res = await fetchJson<{ credits: FilmCredits | null }>(
            `/admin/films/${id}/credits`,
            {
              method: "GET"
            }
          );
          setCreditsLoading(false);
          if (!res.ok) {
            setCredits(null);
            setCreditsState({
              ok: false,
              message: res.error ?? "Failed to load credits"
            });
            return;
          }
          setCredits(res.data?.credits ?? null);
          setCreditsState({
            ok: true,
            message: res.data?.credits
              ? "Credits loaded"
              : "No credits stored for this film yet"
          });
          setPendingContributorId("");
          setCreditQuery("");
          return;
        }
      }

      const parsed = parseFilmTitleWithYear(trimmed);
      const titleLower = parsed.title.toLowerCase();
      const matches = films.filter((f) => f.title.toLowerCase() === titleLower);
      const exact =
        (parsed.releaseYear
          ? (matches.find((f) => Number(f.release_year) === Number(parsed.releaseYear)) ??
            null)
          : null) ?? (matches.length === 1 ? matches[0] : null);

      if (matches.length > 1 && !exact) {
        setSelectedFilmId(null);
        setFilmTitleFallback(parsed.title);
        setCredits(null);
        setCreditsState({
          ok: false,
          message:
            "Multiple films match. Please select a specific film (with year) or type the numeric id."
        });
        return;
      }

      if (exact) {
        const id = exact.id;
        setSelectedFilmId(id);
        setFilmTitleFallback("");
        setCreditsLoading(true);
        const res = await fetchJson<{ credits: FilmCredits | null }>(
          `/admin/films/${id}/credits`,
          {
            method: "GET"
          }
        );
        setCreditsLoading(false);
        if (!res.ok) {
          setCredits(null);
          setCreditsState({ ok: false, message: res.error ?? "Failed to load credits" });
          return;
        }
        setCredits(res.data?.credits ?? null);
        setCreditsState({
          ok: true,
          message: res.data?.credits
            ? "Credits loaded"
            : "No credits stored for this film yet"
        });
        setPendingContributorId("");
        setCreditQuery("");
        return;
      }

      // Free-text title: allow creating a new film on submission.
      setSelectedFilmId(null);
      setFilmTitleFallback(parsed.title);
      setCredits(null);
      setCreditsState({
        ok: true,
        message: "Will create a new film with this title on save."
      });
    },
    [films]
  );

  const summarizeCandidates = useCallback((dataset: unknown) => {
    setCandidateSummary(summarizeCandidateDataset(dataset));
  }, []);

  const onCandidateFile = useCallback(
    async (file: File | null) => {
      if (!file) {
        setCandidateDataset(null);
        setCandidateSummary(null);
        return;
      }
      try {
        const parsed = await readJsonFile(file);
        setCandidateDataset(parsed);
        summarizeCandidates(parsed);
        setCandidateUploadState({ ok: true, message: `Loaded ${file.name}` });
      } catch (err) {
        setCandidateDataset(null);
        setCandidateSummary(null);
        const message = err instanceof Error ? err.message : "Invalid JSON file";
        setCandidateUploadState({ ok: false, message });
      }
    },
    [summarizeCandidates]
  );

  const onCandidateFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      await onCandidateFile(e.target.files?.[0] ?? null);
    },
    [onCandidateFile]
  );

  const resetCandidates = useCallback(() => {
    setCandidateDataset(null);
    setCandidateSummary(null);
    setCandidateUploadState(null);
  }, []);

  const resetManual = useCallback(() => {
    setManualState(null);
    setSelectedCategoryId(null);
    setFilmInput("");
    setSelectedFilmId(null);
    setFilmTitleFallback("");
    setSongTitle("");
    setCredits(null);
    setCreditsState(null);
    setSelectedContributorIds([]);
    setPendingContributorId("");
    setCreditQuery("");
  }, []);

  const uploadCandidateFilms = useCallback(async () => {
    if (!candidateDataset) {
      setCandidateUploadState({ ok: false, message: "Select a JSON dataset first." });
      return;
    }
    if (ceremonyId === null || !Number.isFinite(ceremonyId) || ceremonyId <= 0) {
      setCandidateUploadState({ ok: false, message: "Invalid ceremony id." });
      return;
    }
    setCandidateUploading(true);
    setCandidateUploadState(null);
    const res = await fetchJson(`/admin/films/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(candidateDataset)
    });
    setCandidateUploading(false);
    const payload = res.data as
      | { upserted?: number; hydrated?: number; tmdb_errors?: unknown[] }
      | undefined;
    const upserted = typeof payload?.upserted === "number" ? payload.upserted : undefined;
    const hydrated = typeof payload?.hydrated === "number" ? payload.hydrated : undefined;
    const tmdbErrorsCount = Array.isArray(payload?.tmdb_errors)
      ? payload.tmdb_errors.length
      : 0;
    setCandidateUploadState({
      ok: res.ok,
      message: res.ok
        ? `Loaded candidates${typeof upserted === "number" ? ` (upserted: ${upserted}` : ""}${
            typeof hydrated === "number"
              ? `${typeof upserted === "number" ? ", " : " ("}hydrated from TMDB: ${hydrated}`
              : ""
          }${
            typeof upserted === "number" || typeof hydrated === "number" ? `)` : ""
          }${tmdbErrorsCount ? `. TMDB errors: ${tmdbErrorsCount}` : ""}.`
        : (res.error ?? "Load failed")
    });
  }, [candidateDataset, ceremonyId]);

  const candidateSummaryView = useMemo(() => {
    if (!candidateSummary) return "No dataset loaded.";
    return `Films: ${candidateSummary.films}`;
  }, [candidateSummary]);

  const categoryLabelById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const c of categories) {
      map[c.id] = c.family_name ?? c.family_code ?? `Category ${c.id}`;
    }
    return map;
  }, [categories]);

  const loadNominations = useCallback(async () => {
    if (ceremonyId === null || !Number.isFinite(ceremonyId) || ceremonyId <= 0) return;
    setNominationsLoading(true);
    setNominationsState(null);
    const res = await fetchJson<{ nominations: NominationRow[] }>(
      `/admin/ceremonies/${ceremonyId}/nominations`,
      { method: "GET" }
    );
    setNominationsLoading(false);
    if (!res.ok) {
      setNominationsState({
        ok: false,
        message: res.error ?? "Failed to load nominations"
      });
      return;
    }
    setNominations(res.data?.nominations ?? []);
    setNominationsState({ ok: true, message: "Loaded" });
  }, [ceremonyId]);

  const deleteNomination = useCallback(
    async (nominationId: number) => {
      setNominationsLoading(true);
      setNominationsState(null);
      const res = await fetchJson(`/admin/nominations/${nominationId}`, {
        method: "DELETE"
      });
      setNominationsLoading(false);
      if (!res.ok) {
        setNominationsState({
          ok: false,
          message: res.error ?? "Failed to delete nomination"
        });
        return;
      }
      setNominations((prev) => prev.filter((n) => n.id !== nominationId));
      setNominationsState({ ok: true, message: "Deleted" });
      // Wizard progression depends on ceremony stats; keep them in sync.
      void onWorksheetChange?.();
    },
    [onWorksheetChange]
  );

  const reorderNominationsInCategory = useCallback(
    async (categoryEditionId: number, orderedNominationIds: number[]) => {
      if (ceremonyId === null || !Number.isFinite(ceremonyId) || ceremonyId <= 0) return;
      setNominations((prev) => {
        const order = new Map<number, number>();
        for (let i = 0; i < orderedNominationIds.length; i += 1) {
          order.set(orderedNominationIds[i], i);
        }
        return [...prev].sort((a, b) => {
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
      });

      setNominationsLoading(true);
      setNominationsState(null);
      const res = await fetchJson(`/admin/ceremonies/${ceremonyId}/nominations/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_edition_id: categoryEditionId,
          nomination_ids: orderedNominationIds
        })
      });
      setNominationsLoading(false);
      if (!res.ok) {
        setNominationsState({
          ok: false,
          message: res.error ?? "Failed to reorder nominations"
        });
        void loadNominations();
        return;
      }
      setNominationsState({ ok: true, message: "Reordered" });
    },
    [ceremonyId, loadNominations]
  );

  useEffect(() => {
    if (tab !== "list") return;
    void loadNominations();
  }, [loadNominations, tab]);

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
    if (selectedCategory?.unit_kind === "PERFORMANCE" && selectedCredits.length < 1) {
      setManualState({
        ok: false,
        message: "Performance categories require at least one contributor."
      });
      return;
    }

    setManualLoading(true);
    setManualState(null);
    const res = await fetchJson<{ nomination_id: number }>(
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
          contributors: selectedCredits.map((c) => ({ tmdb_id: c.tmdb_id, name: c.name }))
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
    setFilmInput("");
    setSelectedFilmId(null);
    setFilmTitleFallback("");
    setSongTitle("");
    setCredits(null);
    setCreditsState(null);
    setSelectedContributorIds([]);
    setPendingContributorId("");
    setCreditQuery("");
    void loadNominations();
    void onWorksheetChange?.();
  }, [
    ceremonyId,
    filmTitleFallback,
    loadNominations,
    onWorksheetChange,
    selectedCategory?.unit_kind,
    selectedCategoryId,
    selectedCredits,
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

  const addNominationContributor = useCallback(
    async (
      nominationId: number,
      input: { person_id?: number; name?: string; tmdb_id?: number }
    ) => {
      setManualLoading(true);
      setManualState(null);
      const res = await postNominationContributorReq(nominationId, input);
      setManualLoading(false);
      if (!res.ok) {
        setManualState({ ok: false, message: res.error ?? "Failed to add contributor" });
        return false;
      }
      setManualState({ ok: true, message: "Contributor added" });
      await loadNominations();
      return true;
    },
    [loadNominations]
  );

  const removeNominationContributor = useCallback(
    async (nominationId: number, nominationContributorId: number) => {
      setManualLoading(true);
      setManualState(null);
      const res = await deleteNominationContributorReq(
        nominationId,
        nominationContributorId
      );
      setManualLoading(false);
      if (!res.ok) {
        setManualState({
          ok: false,
          message: res.error ?? "Failed to remove contributor"
        });
        return false;
      }
      setManualState({ ok: true, message: "Contributor removed" });
      await loadNominations();
      return true;
    },
    [loadNominations]
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

    candidateUploading,
    candidateUploadState,
    candidateDataset,
    candidateSummary,
    candidateSummaryView,
    setCandidateDataset,
    setCandidateSummary,

    manualLoading,
    manualState,

    categories,
    films,
    nominations,
    nominationsLoading,
    nominationsState,

    peopleQuery,
    setPeopleQuery,
    peopleResults,
    peopleLoading,
    peopleState,

    selectedCategoryId,
    setSelectedCategoryId,
    selectedCategory,
    categoryLabelById,

    filmInput,
    setFilmInput,
    selectedFilmId,
    setSelectedFilmId,
    filmTitleFallback,
    setFilmTitleFallback,
    songTitle,
    setSongTitle,

    creditsLoading,
    creditsState,
    credits,
    selectedContributorIds,
    setSelectedContributorIds,
    pendingContributorId,
    setPendingContributorId,
    creditQuery,
    setCreditQuery,
    creditOptions,
    creditOptionById,
    selectedCredits,
    filteredCreditOptions,

    actions: {
      getFilmCredits,
      loadManualContext,
      searchPeople,
      resolveFilmSelection,
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
      removeNominationContributor
    }
  };
}

export type AdminCeremonyNomineesOrchestration = ReturnType<
  typeof useAdminCeremonyNomineesOrchestration
>;
