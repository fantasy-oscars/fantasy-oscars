import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchJson } from "../../../lib/api";
import { formatFilmTitleWithYear, parseFilmTitleWithYear } from "../../../lib/films";
import type { ApiResult } from "../../../lib/types";
import { FormStatus } from "../../../ui/forms";

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

export function AdminCeremoniesNomineesPage() {
  const { ceremonyId: ceremonyIdRaw } = useParams();
  const ceremonyId = Number(ceremonyIdRaw);

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
    if (!Number.isFinite(ceremonyId) || ceremonyId <= 0) return;
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

  const summarizeCandidates = useCallback((dataset: unknown) => {
    const films = Array.isArray((dataset as { films?: unknown[] })?.films)
      ? ((dataset as { films?: unknown[] }).films?.length ?? 0)
      : Array.isArray(dataset)
        ? dataset.length
        : 0;
    setCandidateSummary({ films });
  }, []);

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
    if (!Number.isFinite(ceremonyId) || ceremonyId <= 0) {
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
    if (!candidateSummary) return null;
    return (
      <div className="pill-list">
        <span className="pill">Films: {candidateSummary.films}</span>
      </div>
    );
  }, [candidateSummary]);

  const categoryLabelById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const c of categories) {
      map[c.id] = c.family_name ?? c.family_code ?? `Category ${c.id}`;
    }
    return map;
  }, [categories]);

  const loadNominations = useCallback(async () => {
    if (!Number.isFinite(ceremonyId) || ceremonyId <= 0) return;
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
    if (!Number.isFinite(ceremonyId) || ceremonyId <= 0) {
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

  return (
    <div className="stack-lg" style={{ marginTop: 16 }}>
      <div className="card nested">
        <header className="header-with-controls">
          <div>
            <h3>Nominees</h3>
            <p className="muted">
              Candidates, nomination entry, and current nominee list for this ceremony.
            </p>
          </div>
          <div className="inline-actions">
            <button
              type="button"
              className={tab === "candidates" ? "" : "ghost"}
              onClick={() => setTab("candidates")}
            >
              Candidates
            </button>
            <button
              type="button"
              className={tab === "add" ? "" : "ghost"}
              onClick={() => setTab("add")}
            >
              Add nominees
            </button>
            <button
              type="button"
              className={tab === "list" ? "" : "ghost"}
              onClick={() => setTab("list")}
            >
              Nominee list
            </button>
          </div>
        </header>
      </div>

      {tab === "candidates" && (
        <div className="card nested">
          <header className="header-with-controls">
            <div>
              <h3>Candidate films (TMDB import)</h3>
              <p className="muted">
                Seed an internal list of films/candidates (draft only). This does not
                require a nominees dataset.
              </p>
            </div>
            <span className="pill">JSON only</span>
          </header>

          <div className="stack-sm">
            <label className="field">
              <span>Candidate films JSON file</span>
              <input
                type="file"
                accept="application/json"
                onChange={onCandidateFileChange}
              />
            </label>

            {candidateSummaryView}

            <div className="inline-actions">
              <button
                type="button"
                onClick={() => void uploadCandidateFilms()}
                disabled={candidateUploading}
              >
                {candidateUploading ? "Importing..." : "Import candidate films"}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={resetCandidates}
                disabled={candidateUploading}
              >
                Reset
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => void loadManualContext()}
                disabled={candidateUploading}
              >
                Refresh lists
              </button>
            </div>

            <FormStatus loading={candidateUploading} result={candidateUploadState} />
          </div>
        </div>
      )}

      {tab === "add" && (
        <div className="card nested">
          <header className="header-with-controls">
            <div>
              <h3>Add nominees</h3>
              <p className="muted">
                Add nominees one at a time (draft only). Choose a category, then a film,
                then any contributors pulled from TMDB credits.
              </p>
            </div>
            <span className="pill">Draft only</span>
          </header>

          <div className="stack-sm">
            <label className="field">
              <span>Category</span>
              <select
                value={selectedCategoryId ?? ""}
                onChange={(e) =>
                  setSelectedCategoryId(e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">Select category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.family_name ?? c.family_code ?? `Category #${c.id}`} ({c.unit_kind}
                    )
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Film (pick from candidates, or type an id/title)</span>
              <input
                list="candidate-films"
                value={filmInput}
                onChange={(e) => void resolveFilmSelection(e.target.value)}
                placeholder="e.g. 18 or One Battle After Another (2025)"
              />
              <datalist id="candidate-films">
                {films.map((f) => (
                  <option
                    key={f.id}
                    value={formatFilmTitleWithYear(f.title, f.release_year)}
                  >
                    #{f.id}
                    {f.tmdb_id ? ` [tmdb:${f.tmdb_id}]` : ""}
                  </option>
                ))}
              </datalist>
            </label>

            {selectedCategory?.unit_kind === "SONG" && (
              <label className="field">
                <span>Song title</span>
                <input value={songTitle} onChange={(e) => setSongTitle(e.target.value)} />
              </label>
            )}

            <div className="card nested">
              <header className="header-with-controls">
                <div>
                  <h4>Contributors</h4>
                  <p className="muted">
                    Select from this film&apos;s stored TMDB credits. (People details are
                    not hydrated until needed.)
                  </p>
                </div>
                {selectedCategory?.unit_kind === "PERFORMANCE" ? (
                  <span className="pill">Pick 1+</span>
                ) : (
                  <span className="pill">Optional</span>
                )}
              </header>

              <div className="stack-sm">
                <FormStatus loading={creditsLoading} result={creditsState} />

                {creditOptions.length > 0 ? (
                  <div className="stack-sm">
                    <label className="field">
                      <span>Search credits</span>
                      <input
                        value={creditQuery}
                        onChange={(e) => setCreditQuery(e.target.value)}
                        placeholder="Type a name, character, job..."
                      />
                    </label>

                    <label className="field">
                      <span>Find a person</span>
                      <select
                        value={pendingContributorId}
                        size={Math.min(10, Math.max(4, filteredCreditOptions.length + 1))}
                        onChange={(e) => setPendingContributorId(e.target.value)}
                      >
                        <option value="">Select…</option>
                        {filteredCreditOptions.map((o) => (
                          <option key={o.tmdb_id} value={String(o.tmdb_id)}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="inline-actions">
                      <button
                        type="button"
                        onClick={() => {
                          const id = Number(pendingContributorId);
                          if (!Number.isFinite(id) || id <= 0) return;
                          setSelectedContributorIds((prev) =>
                            prev.includes(id) ? prev : [...prev, id]
                          );
                          setPendingContributorId("");
                        }}
                        disabled={!pendingContributorId}
                      >
                        Add person
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          setSelectedContributorIds([]);
                          setPendingContributorId("");
                        }}
                        disabled={selectedContributorIds.length === 0}
                      >
                        Clear
                      </button>
                    </div>

                    <div className="stack-sm">
                      <p className="muted">Selected people</p>
                      {selectedCredits.length === 0 ? (
                        <p className="muted">None yet.</p>
                      ) : (
                        <div className="stack-sm">
                          {selectedCredits.map((c) => (
                            <div key={c.tmdb_id} className="list-row">
                              <div>
                                <strong>{c.name}</strong>
                                <span className="muted"> — {c.jobs.join(", ")}</span>
                              </div>
                              <div className="inline-actions">
                                <button
                                  type="button"
                                  className="ghost"
                                  onClick={() =>
                                    setSelectedContributorIds((prev) =>
                                      prev.filter((id) => id !== c.tmdb_id)
                                    )
                                  }
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="muted">
                    No credits loaded. Select a film with TMDB credits (or import
                    candidates with TMDB hydration enabled).
                  </p>
                )}
              </div>
            </div>

            <div className="inline-actions">
              <button
                type="button"
                onClick={() => void createNomination()}
                disabled={manualLoading}
              >
                {manualLoading ? "Saving..." : "Add nominee"}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={resetManual}
                disabled={manualLoading}
              >
                Reset
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => void loadManualContext()}
                disabled={manualLoading}
              >
                Refresh lists
              </button>
            </div>

            <FormStatus loading={manualLoading} result={manualState} />
          </div>
        </div>
      )}

      {tab === "list" && (
        <div className="card nested">
          <header className="header-with-controls">
            <div>
              <h3>Nominee list</h3>
              <p className="muted">Review the current nominees for this ceremony.</p>
            </div>
            <div className="inline-actions">
              <button
                type="button"
                onClick={() => void loadNominations()}
                disabled={nominationsLoading}
              >
                {nominationsLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </header>

          <div className="stack-sm">
            <FormStatus loading={nominationsLoading} result={nominationsState} />

            {nominations.length === 0 ? (
              <p className="muted">No nominees yet.</p>
            ) : (
              <div className="stack-sm">
                {nominations.map((n) => {
                  const category =
                    categoryLabelById[n.category_edition_id] ??
                    `Category ${n.category_edition_id}`;
                  const people =
                    Array.isArray(n.contributors) && n.contributors.length > 0
                      ? n.contributors.map((c) => c.full_name).join(", ")
                      : (n.performer_name ?? "");
                  const subject = n.song_title
                    ? n.song_title
                    : n.film_title
                      ? n.film_title
                      : `Nomination #${n.id}`;

                  return (
                    <div key={n.id} className="list-row">
                      <div style={{ minWidth: 240 }}>
                        <p className="eyebrow">{category}</p>
                        <strong>{subject}</strong>
                        {n.song_title && n.film_title ? (
                          <p className="muted">from {n.film_title}</p>
                        ) : null}
                      </div>
                      <div style={{ flex: 1 }}>
                        {people ? (
                          <p className="muted">{people}</p>
                        ) : (
                          <p className="muted">—</p>
                        )}
                      </div>
                      <div>
                        <div className="inline-actions">
                          <span className="pill">#{n.id}</span>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => void deleteNomination(n.id)}
                            disabled={nominationsLoading}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
