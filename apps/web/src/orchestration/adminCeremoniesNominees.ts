import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../lib/api";
import { parseFilmTitleWithYear } from "../lib/films";
import type { ApiResult } from "../lib/types";

type CeremonyCategory = {
  id: number;
  unit_kind: "FILM" | "SONG" | "PERFORMANCE";
  family_name?: string;
  family_code?: string;
};

type CandidateFilm = {
  id: number;
  title: string;
  release_year?: number | null;
  tmdb_id?: number | null;
};

type FilmCredits = {
  cast?: Array<{
    tmdb_id: number;
    name: string;
    character?: string | null;
    order?: number | null;
    credit_id?: string | null;
    profile_path?: string | null;
  }>;
  crew?: Array<{
    tmdb_id: number;
    name: string;
    department?: string | null;
    job?: string | null;
    credit_id?: string | null;
    profile_path?: string | null;
  }>;
};

type CreditOption = {
  tmdb_id: number;
  name: string;
  jobs: string[];
  label: string;
  search: string;
};

type NominationRow = {
  id: number;
  category_edition_id: number;
  film_title?: string | null;
  song_title?: string | null;
  performer_name?: string | null;
  contributors?: Array<{
    person_id: number;
    full_name: string;
    role_label: string | null;
    sort_order: number;
  }>;
};

export function useAdminCeremonyNomineesOrchestration(args: {
  ceremonyId: number | null;
}) {
  const ceremonyId = args.ceremonyId;

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

  const readJsonFile = useCallback(async (file: File) => {
    const text =
      typeof file.text === "function"
        ? await file.text()
        : await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () =>
              reject(reader.error ?? new Error("Unable to read file as text"));
            reader.readAsText(file);
          });
    return JSON.parse(text) as unknown;
  }, []);

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

  const creditByPersonId = useMemo(() => {
    const map = new Map<
      number,
      {
        name: string;
        crewJobs: string[];
        crewJobsSet: Set<string>;
        characters: string[];
        characterSet: Set<string>;
        isCast: boolean;
      }
    >();
    if (!credits) return map;

    for (const c of credits.crew ?? []) {
      if (!c?.tmdb_id || !c?.name) continue;
      const job =
        typeof c.job === "string" && c.job.trim()
          ? c.job.trim()
          : typeof c.department === "string" && c.department.trim()
            ? c.department.trim()
            : "";
      if (!job) continue;
      const existing = map.get(c.tmdb_id) ?? {
        name: c.name,
        crewJobs: [],
        crewJobsSet: new Set<string>(),
        characters: [],
        characterSet: new Set<string>(),
        isCast: false
      };
      if (!existing.crewJobsSet.has(job)) {
        existing.crewJobsSet.add(job);
        existing.crewJobs.push(job);
      }
      map.set(c.tmdb_id, existing);
    }

    for (const c of credits.cast ?? []) {
      if (!c?.tmdb_id || !c?.name) continue;
      const character =
        typeof c.character === "string" && c.character.trim() ? c.character.trim() : "";
      const existing = map.get(c.tmdb_id) ?? {
        name: c.name,
        crewJobs: [],
        crewJobsSet: new Set<string>(),
        characters: [],
        characterSet: new Set<string>(),
        isCast: false
      };
      existing.isCast = true;
      if (character && !existing.characterSet.has(character)) {
        existing.characterSet.add(character);
        existing.characters.push(character);
      }
      map.set(c.tmdb_id, existing);
    }

    return map;
  }, [credits]);

  const creditOptions = useMemo<CreditOption[]>(() => {
    const opts: CreditOption[] = [];
    for (const [tmdbId, info] of creditByPersonId.entries()) {
      const jobs: string[] = [];
      for (const j of info.crewJobs) jobs.push(j);
      if (info.isCast) {
        const role = info.characters.length ? ` (as ${info.characters.join(" / ")})` : "";
        jobs.push(`Cast${role}`);
      }
      const label = `${info.name} -- ${jobs.join(", ")}`;
      opts.push({
        tmdb_id: tmdbId,
        name: info.name,
        jobs,
        label,
        search: `${info.name} ${jobs.join(" ")}`.toLowerCase()
      });
    }
    return opts.sort((a, b) => a.name.localeCompare(b.name));
  }, [creditByPersonId]);

  const creditOptionById = useMemo(() => {
    const map: Record<number, CreditOption> = {};
    for (const o of creditOptions) map[o.tmdb_id] = o;
    return map;
  }, [creditOptions]);

  const selectedCredits = useMemo(() => {
    return selectedContributorIds
      .map((id) => creditOptionById[id])
      .filter((v): v is CreditOption => Boolean(v));
  }, [creditOptionById, selectedContributorIds]);

  const filteredCreditOptions = useMemo(() => {
    const q = creditQuery.trim().toLowerCase();
    if (!q) return creditOptions;
    return creditOptions.filter((o) => o.search.includes(q));
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

  const summarizeCandidates = useCallback(
    (dataset: unknown) => {
      const films = Array.isArray((dataset as { films?: unknown[] })?.films)
        ? ((dataset as { films?: unknown[] }).films?.length ?? 0)
        : Array.isArray(dataset)
          ? dataset.length
          : 0;
      setCandidateSummary({ films });
    },
    [ceremonyId]
  );

  const onCandidateFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
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
    [readJsonFile, summarizeCandidates]
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
        ? `Imported candidates${typeof upserted === "number" ? ` (upserted: ${upserted}` : ""}${
            typeof hydrated === "number"
              ? `${typeof upserted === "number" ? ", " : " ("}hydrated from TMDB: ${hydrated}`
              : ""
          }${
            typeof upserted === "number" || typeof hydrated === "number" ? `)` : ""
          }${tmdbErrorsCount ? `. TMDB errors: ${tmdbErrorsCount}` : ""}.`
        : (res.error ?? "Import failed")
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
      if (!window.confirm("Delete this nomination?")) return;
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
      setNominationsState({ ok: true, message: "Deleted" });
      void loadNominations();
    },
    [loadNominations]
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
    // Keep category/film for fast data entry; reset the variable pieces.
    setSongTitle("");
    setSelectedContributorIds([]);
    setPendingContributorId("");
    void loadNominations();
  }, [
    ceremonyId,
    filmTitleFallback,
    loadNominations,
    selectedCategory?.unit_kind,
    selectedCategoryId,
    selectedCredits,
    selectedFilmId,
    songTitle
  ]);

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
      loadManualContext,
      resolveFilmSelection,
      onCandidateFileChange,
      resetCandidates,
      resetManual,
      uploadCandidateFilms,
      loadNominations,
      deleteNomination,
      createNomination
    }
  };
}

export type AdminCeremonyNomineesOrchestration = ReturnType<
  typeof useAdminCeremonyNomineesOrchestration
>;
