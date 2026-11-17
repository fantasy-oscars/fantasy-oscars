import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "../lib/api";
import {
  contenderErrorMessage,
  contenderPeople,
  contenderPickerStep,
  contenderSearchTerm,
  filterContenderPeople,
  type ContenderCategory,
  type ContenderCredits,
  type ContenderFilm,
  type ContenderPerson
} from "../decisions/contenders";

/*
 * Contender picker workflow: load a Circuit's categories, search TMDB films,
 * load a film's credits for acting categories and upsert the selection.
 * Reusable by any screen that lets a player pick a contender.
 */

export type ContenderSelection = {
  id: number;
  circuit_category_id: number;
  film_tmdb_id: number;
  person_tmdb_id: number | null;
  film: {
    id: number;
    title: string;
    release_year: number | null;
    poster_url: string | null;
  };
  person: { id: number; name: string; profile_url: string | null } | null;
};

type LoadState = "idle" | "loading" | "error" | "ready";

export const CONTENDER_SEARCH_DEBOUNCE_MS = 300;

export function useContenderPickerOrchestration(args: {
  circuitId: number | null;
  onPicked?: (selection: ContenderSelection) => void;
}) {
  const { circuitId, onPicked } = args;

  const [categoriesState, setCategoriesState] = useState<LoadState>("loading");
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [categories, setCategories] = useState<ContenderCategory[]>([]);

  const [category, setCategory] = useState<ContenderCategory | null>(null);
  const [film, setFilm] = useState<ContenderFilm | null>(null);
  const [person, setPerson] = useState<ContenderPerson | null>(null);

  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<LoadState>("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<ContenderFilm[]>([]);
  const searchSeq = useRef(0);

  const [creditsFor, setCreditsFor] = useState<number | null>(null);
  const [creditsState, setCreditsState] = useState<LoadState>("idle");
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const [people, setPeople] = useState<ContenderPerson[]>([]);
  const [peopleFilter, setPeopleFilter] = useState("");
  const creditsSeq = useRef(0);

  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [picked, setPicked] = useState<ContenderSelection | null>(null);

  const { term, hint: searchHint } = contenderSearchTerm(query);

  useEffect(() => {
    if (circuitId === null) {
      setCategoriesState("error");
      setCategoriesError("That season link doesn't look right.");
      return;
    }
    let cancelled = false;
    setCategoriesState("loading");
    void fetchJson<{ categories: ContenderCategory[] }>(
      `/circuits/${circuitId}/categories`,
      { method: "GET" }
    ).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setCategoriesError(
          res.status === 404
            ? "This season isn't open yet."
            : (res.error ?? "Could not load categories.")
        );
        setCategoriesState("error");
        return;
      }
      setCategories(
        (res.data?.categories ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind
        }))
      );
      setCategoriesState("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [circuitId]);

  // Debounced search; a newer request supersedes any in flight.
  useEffect(() => {
    const seq = ++searchSeq.current;
    if (term === null) {
      setSearchState("idle");
      setSearchError(null);
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setSearchState("loading");
      void fetchJson<{ results: ContenderFilm[] }>(
        `/contenders/films/search?q=${encodeURIComponent(term)}`,
        { method: "GET" }
      ).then((res) => {
        if (seq !== searchSeq.current) return;
        if (!res.ok) {
          setSearchError(contenderErrorMessage(res));
          setSearchState("error");
          return;
        }
        setResults(res.data?.results ?? []);
        setSearchError(null);
        setSearchState("ready");
      });
    }, CONTENDER_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  const needsCredits = category?.kind === "ACTING" && film !== null;
  const filmTmdbId = film?.tmdb_id ?? null;

  const loadCredits = useCallback(async (tmdbId: number) => {
    const seq = ++creditsSeq.current;
    setCreditsFor(tmdbId);
    setCreditsState("loading");
    setCreditsError(null);
    setPeople([]);
    const res = await fetchJson<ContenderCredits>(`/contenders/films/${tmdbId}/credits`, {
      method: "GET"
    });
    if (seq !== creditsSeq.current) return;
    if (!res.ok) {
      setCreditsError(contenderErrorMessage(res));
      setCreditsState("error");
      return;
    }
    setPeople(contenderPeople(res.data ?? { cast: [], crew: [] }));
    setCreditsState("ready");
  }, []);

  useEffect(() => {
    if (needsCredits && filmTmdbId !== null && creditsFor !== filmTmdbId) {
      void loadCredits(filmTmdbId);
    }
  }, [needsCredits, filmTmdbId, creditsFor, loadCredits]);

  const visiblePeople = useMemo(
    () => filterContenderPeople(people, peopleFilter),
    [people, peopleFilter]
  );

  const clearOutcome = () => {
    setPicked(null);
    setPickError(null);
  };

  const selectCategory = useCallback(
    (id: number | null) => {
      setCategory(categories.find((c) => c.id === id) ?? null);
      setPerson(null);
      setPeopleFilter("");
      clearOutcome();
    },
    [categories]
  );

  const selectFilm = useCallback((next: ContenderFilm) => {
    setFilm(next);
    setPerson(null);
    setPeopleFilter("");
    clearOutcome();
  }, []);

  const changeFilm = useCallback(() => {
    setFilm(null);
    setPerson(null);
    setPeopleFilter("");
    clearOutcome();
  }, []);

  const selectPerson = useCallback((next: ContenderPerson) => {
    setPerson(next);
    clearOutcome();
  }, []);

  const changePerson = useCallback(() => {
    setPerson(null);
    clearOutcome();
  }, []);

  const retryCredits = useCallback(() => {
    if (filmTmdbId !== null) void loadCredits(filmTmdbId);
  }, [filmTmdbId, loadCredits]);

  const pick = useCallback(async () => {
    if (!category || !film) return;
    setPicking(true);
    setPickError(null);
    const res = await fetchJson<{ selection: ContenderSelection }>(
      "/contenders/selections",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          circuit_category_id: category.id,
          film_tmdb_id: film.tmdb_id,
          person_tmdb_id: category.kind === "ACTING" ? (person?.tmdb_id ?? null) : null
        })
      }
    );
    setPicking(false);
    if (!res.ok || !res.data) {
      setPickError(contenderErrorMessage(res));
      return;
    }
    setPicked(res.data.selection);
    onPicked?.(res.data.selection);
  }, [category, film, person, onPicked]);

  const startOver = useCallback(() => {
    setFilm(null);
    setPerson(null);
    setPeopleFilter("");
    setQuery("");
    clearOutcome();
  }, []);

  return {
    categoriesState,
    categoriesError,
    categories,
    step: contenderPickerStep({ category, film, person }),
    category,
    film,
    person,
    search: { query, hint: searchHint, state: searchState, error: searchError, results },
    credits: {
      state: creditsState,
      error: creditsError,
      people: visiblePeople,
      total: people.length,
      filter: peopleFilter
    },
    picking,
    pickError,
    picked,
    actions: {
      selectCategory,
      setQuery,
      selectFilm,
      changeFilm,
      setPeopleFilter,
      selectPerson,
      changePerson,
      retryCredits,
      pick,
      startOver
    }
  };
}

export type ContenderPickerOrchestration = ReturnType<
  typeof useContenderPickerOrchestration
>;
