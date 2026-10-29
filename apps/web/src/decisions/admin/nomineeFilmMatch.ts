export type FilmMatchCandidate = {
  id: number;
  title: string;
  release_year?: number | null;
  tmdb_id?: number | null;
};

export type FilmMatchResult<T extends FilmMatchCandidate> = {
  /** All films whose title equals the typed title (case-insensitive). */
  matches: T[];
  /** The single film to select, when the typed value pins one down. */
  exact: T | null;
  /** More than one film matches and none could be singled out. */
  ambiguous: boolean;
};

/** Prefer TMDB-linked films, then the newest release year, then the lowest id. */
export function pickPreferredFilmMatch<T extends FilmMatchCandidate>(
  candidates: T[]
): T | null {
  return (
    candidates.slice().sort((a, b) => {
      const aLinked = Number.isInteger(a.tmdb_id) ? 1 : 0;
      const bLinked = Number.isInteger(b.tmdb_id) ? 1 : 0;
      if (aLinked !== bLinked) return bLinked - aLinked;
      const aYear = Number.isInteger(a.release_year) ? Number(a.release_year) : -Infinity;
      const bYear = Number.isInteger(b.release_year) ? Number(b.release_year) : -Infinity;
      if (aYear !== bYear) return bYear - aYear;
      return a.id - b.id;
    })[0] ?? null
  );
}

export function matchFilmByTitle<T extends FilmMatchCandidate>(
  films: T[],
  parsed: { title: string; releaseYear?: number | string | null }
): FilmMatchResult<T> {
  const titleLower = parsed.title.toLowerCase();
  const matches = films.filter((f) => f.title.toLowerCase() === titleLower);
  const yearMatches = parsed.releaseYear
    ? matches.filter((f) => Number(f.release_year) === Number(parsed.releaseYear))
    : [];
  const exact =
    (yearMatches.length > 0 ? pickPreferredFilmMatch(yearMatches) : null) ??
    (matches.length === 1 ? matches[0] : null);
  return { matches, exact, ambiguous: matches.length > 1 && !exact };
}
