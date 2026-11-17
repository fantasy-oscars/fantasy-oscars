import {
  buildTmdbImageUrlFromConfig,
  fetchTmdbMovieDetailsWithCredits,
  getTmdbImageConfig,
  parseReleaseYear,
  searchTmdbMovies
} from "../lib/tmdb.js";
import { registerCache, TtlCache } from "../utils/ttlCache.js";

// Player-facing TMDB reads for picking contenders. Each search is one upstream
// call (no per-result enrichment) and both reads are cached in process.

export type ContenderFilm = {
  tmdb_id: number;
  title: string;
  original_title: string | null;
  release_date: string | null;
  release_year: number | null;
  poster_url: string | null;
};

export type ContenderFilmCredits = {
  film: Omit<ContenderFilm, "original_title">;
  cast: Array<{
    tmdb_id: number;
    name: string;
    character: string | null;
    order: number | null;
    profile_url: string | null;
  }>;
  crew: Array<{
    tmdb_id: number;
    name: string;
    department: string | null;
    job: string | null;
    profile_url: string | null;
  }>;
};

const HOUR_MS = 60 * 60 * 1000;

const searchCache = registerCache(
  new TtlCache<ContenderFilm[]>({ ttlMs: HOUR_MS, maxEntries: 2000 })
);
const creditsCache = registerCache(
  new TtlCache<ContenderFilmCredits>({ ttlMs: 24 * HOUR_MS, maxEntries: 2000 })
);

function nullableText(value: string | null | undefined): string | null {
  return value ? value : null;
}

/** `normalizedQuery` is already normalised (see `normalizeContenderQuery`). */
export async function searchContenderFilms(
  normalizedQuery: string
): Promise<ContenderFilm[]> {
  const cached = searchCache.get(normalizedQuery);
  if (cached) return cached;

  const movies = await searchTmdbMovies(normalizedQuery);
  const cfg = await getTmdbImageConfig();
  const results: ContenderFilm[] = movies
    .filter((m) => Number.isInteger(m.id) && m.id > 0)
    .map((m) => ({
      tmdb_id: m.id,
      title: m.title,
      original_title: nullableText(m.original_title),
      release_date: nullableText(m.release_date),
      release_year: parseReleaseYear(m.release_date ?? null),
      poster_url: buildTmdbImageUrlFromConfig(cfg, "poster", m.poster_path, "w185")
    }));

  searchCache.set(normalizedQuery, results);
  return results;
}

export async function getContenderFilmCredits(
  tmdbId: number
): Promise<ContenderFilmCredits> {
  const key = String(tmdbId);
  const cached = creditsCache.get(key);
  if (cached) return cached;

  const movie = await fetchTmdbMovieDetailsWithCredits(tmdbId);
  const cfg = await getTmdbImageConfig();
  const profile = (path: string | null | undefined) =>
    buildTmdbImageUrlFromConfig(cfg, "profile", path, "w185");

  const credits: ContenderFilmCredits = {
    film: {
      tmdb_id: movie.id,
      title: movie.title,
      release_date: nullableText(movie.release_date),
      release_year: parseReleaseYear(movie.release_date ?? null),
      poster_url: buildTmdbImageUrlFromConfig(cfg, "poster", movie.poster_path, "w185")
    },
    cast: (movie.credits?.cast ?? []).map((c) => ({
      tmdb_id: c.id,
      name: c.name,
      character: nullableText(c.character),
      order: c.order ?? null,
      profile_url: profile(c.profile_path)
    })),
    crew: (movie.credits?.crew ?? []).map((c) => ({
      tmdb_id: c.id,
      name: c.name,
      department: nullableText(c.department),
      job: nullableText(c.job),
      profile_url: profile(c.profile_path)
    }))
  };

  creditsCache.set(key, credits);
  return credits;
}
