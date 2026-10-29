import { useCallback, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { fetchJson } from "../../../lib/api";
import { formatFilmTitleWithYear, parseFilmTitleWithYear } from "../../../lib/films";
import type { ApiResult } from "../../../lib/types";
import {
  buildCreditByPersonId,
  buildCreditOptions,
  type CreditOption,
  type FilmCredits
} from "../../../decisions/admin/nomineeCredits";
import { matchFilmByTitle } from "../../../decisions/admin/nomineeFilmMatch";
import { buildSelectedCredits } from "../../../decisions/admin/nomineeLists";
import type { CandidateFilm } from "./types";
import { fetchAllFilms } from "./actions";

const MULTIPLE_MATCH_MESSAGE =
  "Multiple films match. Please select a specific film (with year) or type the numeric id.";

/** Film + contributor selection state for the manual "add nominee" form. */
export function useNomineeFilmEntry(args: {
  films: CandidateFilm[];
  setFilms: Dispatch<SetStateAction<CandidateFilm[]>>;
  setManualLoading: (loading: boolean) => void;
  setManualState: (state: ApiResult | null) => void;
}) {
  const { films, setFilms, setManualLoading, setManualState } = args;

  const [filmInput, setFilmInput] = useState("");
  const [selectedFilmId, setSelectedFilmId] = useState<number | null>(null);
  const [filmTitleFallback, setFilmTitleFallback] = useState("");

  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsState, setCreditsState] = useState<ApiResult | null>(null);
  const [credits, setCredits] = useState<FilmCredits | null>(null);
  const [selectedContributors, setSelectedContributors] = useState<
    Array<{ key: string; name: string; tmdb_id: number | null }>
  >([]);
  const [pendingContributorInput, setPendingContributorInput] = useState<string>("");
  const [creditQuery, setCreditQuery] = useState("");

  const creditByPersonId = useMemo(() => {
    return buildCreditByPersonId(credits);
  }, [credits]);

  const creditOptions = useMemo<CreditOption[]>(() => {
    return buildCreditOptions(creditByPersonId);
  }, [creditByPersonId]);

  const selectedCredits = useMemo(() => {
    return buildSelectedCredits(selectedContributors);
  }, [selectedContributors]);

  /** Clears the film, credits and contributor selection (not the song title or category). */
  const resetFilmEntry = useCallback(() => {
    setFilmInput("");
    setSelectedFilmId(null);
    setFilmTitleFallback("");
    setCredits(null);
    setCreditsState(null);
    setSelectedContributors([]);
    setPendingContributorInput("");
    setCreditQuery("");
  }, []);

  const loadFilmCredits = useCallback(async (id: number) => {
    setCreditsLoading(true);
    const res = await fetchJson<{ credits: FilmCredits | null }>(
      `/admin/films/${id}/credits`,
      { method: "GET" }
    );
    setCreditsLoading(false);
    if (!res.ok) {
      setCredits(null);
      setCreditsState({ ok: false, message: res.error ?? "Failed to load credits" });
      return false;
    }
    setCredits(res.data?.credits ?? null);
    setCreditsState({
      ok: true,
      message: res.data?.credits
        ? "Credits loaded"
        : "No credits stored for this film yet"
    });
    return true;
  }, []);

  const selectResolvedFilm = useCallback(
    async (id: number) => {
      setSelectedFilmId(id);
      setFilmTitleFallback("");
      if (await loadFilmCredits(id)) {
        setPendingContributorInput("");
        setCreditQuery("");
      }
    },
    [loadFilmCredits]
  );

  const flagAmbiguousTitle = useCallback((title: string) => {
    setSelectedFilmId(null);
    setFilmTitleFallback(title);
    setCredits(null);
    setCreditsState({ ok: false, message: MULTIPLE_MATCH_MESSAGE });
  }, []);

  const resolveFilmSelection = useCallback(
    async (value: string) => {
      setFilmInput(value);
      setCredits(null);
      setCreditsState(null);
      setSelectedContributors([]);
      setPendingContributorInput("");
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
          await selectResolvedFilm(id);
          return;
        }
      }

      const parsed = parseFilmTitleWithYear(trimmed);
      const local = matchFilmByTitle(films, parsed);

      if (local.ambiguous) {
        flagAmbiguousTitle(parsed.title);
        return;
      }

      if (local.exact) {
        await selectResolvedFilm(local.exact.id);
        return;
      }

      // If local cache misses, query backend and merge results so search can find films
      // added outside this screen without requiring a full reload.
      const remoteRes = await fetchAllFilms(parsed.title);
      if (remoteRes.ok) {
        const remoteFilms = remoteRes.films;
        setFilms((prev) => {
          const byId = new Map<number, CandidateFilm>();
          for (const f of prev) byId.set(f.id, f);
          for (const f of remoteFilms) byId.set(f.id, f);
          return Array.from(byId.values());
        });
        const remote = matchFilmByTitle(remoteFilms, parsed);

        if (remote.ambiguous) {
          flagAmbiguousTitle(parsed.title);
          return;
        }

        if (remote.exact) {
          await selectResolvedFilm(remote.exact.id);
          return;
        }
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
    [films, flagAmbiguousTitle, selectResolvedFilm, setFilms]
  );

  const selectFilmFromPicker = useCallback(
    async (film: CandidateFilm) => {
      const id = Number(film.id);
      if (!Number.isFinite(id) || id <= 0) return;
      setFilmInput(formatFilmTitleWithYear(film.title, film.release_year ?? null));
      setSelectedFilmId(id);
      setFilmTitleFallback("");
      setCredits(null);
      setCreditsState(null);
      setSelectedContributors([]);
      setPendingContributorInput("");
      setCreditQuery("");

      await loadFilmCredits(id);
    },
    [loadFilmCredits]
  );

  const createUnlinkedFilmFromInput = useCallback((input: string) => {
    const parsed = parseFilmTitleWithYear(input.trim());
    if (!parsed.title) return;
    setFilmInput(parsed.title);
    setSelectedFilmId(null);
    setFilmTitleFallback(parsed.title);
    setCredits(null);
    setCreditsState({
      ok: true,
      message: "Will create a new unlinked film with this title on save."
    });
    setSelectedContributors([]);
    setPendingContributorInput("");
    setCreditQuery("");
  }, []);

  const selectTmdbFilmCandidate = useCallback(
    async (candidate: {
      tmdb_id: number;
      title: string;
      release_year: number | null;
    }) => {
      setFilmInput(formatFilmTitleWithYear(candidate.title, candidate.release_year));
      setSelectedFilmId(null);
      setFilmTitleFallback("");
      setCredits(null);
      setCreditsState(null);
      setSelectedContributors([]);
      setPendingContributorInput("");
      setCreditQuery("");
      setManualLoading(true);
      setManualState(null);

      const importRes = await fetchJson<{
        ok: true;
        upserted?: number;
        hydrated?: number;
      }>("/admin/films/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          films: [
            {
              title: candidate.title,
              tmdb_id: candidate.tmdb_id,
              year: candidate.release_year
            }
          ]
        })
      });
      if (!importRes.ok) {
        setManualLoading(false);
        setManualState({
          ok: false,
          message: importRes.error ?? "Could not create film from TMDB"
        });
        return;
      }

      const byTmdbRes = await fetchJson<{
        film: { id: number; title: string; tmdb_id: number };
      }>(`/admin/films/by-tmdb/${candidate.tmdb_id}`, { method: "GET" });
      if (!byTmdbRes.ok || !byTmdbRes.data?.film?.id) {
        setManualLoading(false);
        setManualState({
          ok: false,
          message: byTmdbRes.error ?? "Could not load created film"
        });
        return;
      }

      const created = byTmdbRes.data.film;
      const filmId = Number(created.id);
      setFilms((prev) => {
        const byId = new Map<number, CandidateFilm>();
        for (const f of prev) byId.set(f.id, f);
        byId.set(filmId, {
          id: filmId,
          title: created.title,
          tmdb_id: created.tmdb_id,
          release_year: candidate.release_year
        });
        return Array.from(byId.values());
      });
      setSelectedFilmId(filmId);
      setFilmInput(formatFilmTitleWithYear(created.title, candidate.release_year));

      const creditsRes = await fetchJson<{ credits: FilmCredits | null }>(
        `/admin/films/${filmId}/credits`,
        { method: "GET" }
      );
      setManualLoading(false);
      if (!creditsRes.ok) {
        setCredits(null);
        setCreditsState({
          ok: false,
          message: creditsRes.error ?? "Failed to load credits"
        });
        return;
      }
      setCredits(creditsRes.data?.credits ?? null);
      setCreditsState({
        ok: true,
        message: creditsRes.data?.credits
          ? "Film linked and credits loaded"
          : "Film linked. No credits stored for this film yet"
      });
    },
    [setFilms, setManualLoading, setManualState]
  );

  return {
    filmInput,
    setFilmInput,
    selectedFilmId,
    setSelectedFilmId,
    filmTitleFallback,
    setFilmTitleFallback,
    creditsLoading,
    creditsState,
    credits,
    selectedContributors,
    setSelectedContributors,
    pendingContributorInput,
    setPendingContributorInput,
    creditQuery,
    setCreditQuery,
    creditOptions,
    selectedCredits,
    resetFilmEntry,
    resolveFilmSelection,
    selectFilmFromPicker,
    createUnlinkedFilmFromInput,
    selectTmdbFilmCandidate
  };
}
