import { AppError } from "../errors.js";
import { log } from "../logger.js";

export type TmdbImageConfig = {
  secureBaseUrl: string;
  posterSizes: string[];
  profileSizes: string[];
};

type TmdbMovieDetails = {
  id: number;
  title: string;
  release_date?: string | null;
  poster_path?: string | null;
  credits?: {
    cast?: Array<{
      id: number;
      name: string;
      credit_id?: string;
      character?: string | null;
      order?: number | null;
      profile_path?: string | null;
    }>;
    crew?: Array<{
      id: number;
      name: string;
      credit_id?: string;
      department?: string | null;
      job?: string | null;
      profile_path?: string | null;
    }>;
  };
};

type TmdbMovieSearchResult = {
  id: number;
  title: string;
  original_title?: string | null;
  release_date?: string | null;
  poster_path?: string | null;
  overview?: string | null;
};

type TmdbPersonDetails = {
  id: number;
  name: string;
  profile_path?: string | null;
};

type TmdbPersonSearchResult = {
  id: number;
  name: string;
  known_for_department?: string | null;
  profile_path?: string | null;
};

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// Abort any TMDB call that has not answered within this long.
export const TMDB_TIMEOUT_MS = 5000;

// Upstream details go to the log only; clients get these fixed messages.
function tmdbUpstreamError(): AppError {
  return new AppError("TMDB_UPSTREAM_ERROR", 502, "Film data could not be loaded");
}

function tmdbUnavailable(): AppError {
  return new AppError(
    "TMDB_UNAVAILABLE",
    503,
    "Film data is unavailable right now. Try again shortly."
  );
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")
  );
}

function logTmdbFailure(path: string, detail: Record<string, unknown>) {
  log({ level: "error", msg: "tmdb_request_failed", path, ...detail });
}

function requireTmdbReadToken(env: NodeJS.ProcessEnv = process.env): string {
  // Backwards-compatible: we previously used `TMDB_API_TOKEN` locally/ops.
  // Prefer the explicit "read access token" name going forward.
  const token = env.TMDB_READ_ACCESS_TOKEN ?? env.TMDB_API_TOKEN;
  if (!token || token.trim() === "") {
    logTmdbFailure("config", {
      error:
        "TMDB token env var is not set (expected TMDB_READ_ACCESS_TOKEN; falling back to TMDB_API_TOKEN)"
    });
    throw tmdbUnavailable();
  }
  return token.trim();
}

async function tmdbGetJson<T>(
  path: string,
  searchParams: Record<string, string | number | undefined> = {}
): Promise<T> {
  const token = requireTmdbReadToken();
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  for (const [k, v] of Object.entries(searchParams)) {
    if (v === undefined) continue;
    url.searchParams.set(k, String(v));
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`
      },
      signal: AbortSignal.timeout(TMDB_TIMEOUT_MS)
    });
  } catch (err) {
    // Timeouts and network failures alike mean TMDB cannot be reached.
    logTmdbFailure(path, {
      error: err instanceof Error ? err.message : String(err),
      error_name: err instanceof Error ? err.name : undefined
    });
    throw tmdbUnavailable();
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logTmdbFailure(path, { status: res.status, body: body.slice(0, 500) });
    if (res.status === 404) {
      throw new AppError("TMDB_NOT_FOUND", 404, "Film or person not found");
    }
    if (res.status === 429 || res.status === 503) throw tmdbUnavailable();
    throw tmdbUpstreamError();
  }

  try {
    return (await res.json()) as T;
  } catch (err) {
    logTmdbFailure(path, {
      error: err instanceof Error ? err.message : String(err),
      error_name: err instanceof Error ? err.name : undefined
    });
    // The timeout also covers reading the body.
    throw isAbortError(err) ? tmdbUnavailable() : tmdbUpstreamError();
  }
}

let imageConfigCache: { value: TmdbImageConfig; expiresAtMs: number } | null = null;

export async function getTmdbImageConfig(): Promise<TmdbImageConfig> {
  const now = Date.now();
  if (imageConfigCache && imageConfigCache.expiresAtMs > now)
    return imageConfigCache.value;

  const raw = await tmdbGetJson<{
    images: {
      secure_base_url: string;
      poster_sizes: string[];
      profile_sizes: string[];
    };
  }>("/configuration");

  const value: TmdbImageConfig = {
    secureBaseUrl: raw.images.secure_base_url,
    posterSizes: raw.images.poster_sizes,
    profileSizes: raw.images.profile_sizes
  };

  // Images config is effectively static; cache for a day.
  imageConfigCache = { value, expiresAtMs: now + 24 * 60 * 60 * 1000 };
  return value;
}

function pickSize(available: string[], preferred: string, fallback: string): string {
  if (available.includes(preferred)) return preferred;
  if (available.includes(fallback)) return fallback;
  return available[0] ?? preferred;
}

export function buildTmdbImageUrlFromConfig(
  cfg: TmdbImageConfig,
  kind: "poster" | "profile",
  filePath: string | null | undefined,
  preferredSize: string
): string | null {
  if (!filePath) return null;
  const sizes = kind === "poster" ? cfg.posterSizes : cfg.profileSizes;
  const size = pickSize(sizes, preferredSize, "w500");
  // filePath from TMDB already includes the leading slash.
  return `${cfg.secureBaseUrl}${size}${filePath}`;
}

export async function buildTmdbImageUrl(
  kind: "poster" | "profile",
  filePath: string | null | undefined,
  preferredSize: string
): Promise<string | null> {
  if (!filePath) return null;
  const cfg = await getTmdbImageConfig();
  return buildTmdbImageUrlFromConfig(cfg, kind, filePath, preferredSize);
}

export async function fetchTmdbMovieDetailsWithCredits(
  tmdbMovieId: number
): Promise<TmdbMovieDetails> {
  return tmdbGetJson<TmdbMovieDetails>(`/movie/${tmdbMovieId}`, {
    append_to_response: "credits",
    language: "en-US",
    include_image_language: "en,null"
  });
}

export async function fetchTmdbMovieDetails(
  tmdbMovieId: number
): Promise<Pick<TmdbMovieDetails, "id" | "title" | "release_date" | "poster_path">> {
  return tmdbGetJson<
    Pick<TmdbMovieDetails, "id" | "title" | "release_date" | "poster_path">
  >(`/movie/${tmdbMovieId}`, {
    language: "en-US",
    include_image_language: "en,null"
  });
}

export async function searchTmdbMovies(
  queryText: string
): Promise<TmdbMovieSearchResult[]> {
  const queryTrimmed = String(queryText ?? "").trim();
  if (!queryTrimmed) return [];
  const res = await tmdbGetJson<{ results?: TmdbMovieSearchResult[] }>("/search/movie", {
    query: queryTrimmed,
    language: "en-US",
    include_adult: "false",
    page: 1
  });
  return Array.isArray(res.results) ? res.results : [];
}

export async function fetchTmdbPersonDetails(
  tmdbPersonId: number
): Promise<TmdbPersonDetails> {
  return tmdbGetJson<TmdbPersonDetails>(`/person/${tmdbPersonId}`, { language: "en-US" });
}

export async function searchTmdbPeople(
  queryText: string
): Promise<TmdbPersonSearchResult[]> {
  const queryTrimmed = String(queryText ?? "").trim();
  if (!queryTrimmed) return [];
  const res = await tmdbGetJson<{ results?: TmdbPersonSearchResult[] }>(
    "/search/person",
    {
      query: queryTrimmed,
      language: "en-US",
      include_adult: "false",
      page: 1
    }
  );
  return Array.isArray(res.results) ? res.results : [];
}

export function parseReleaseYear(releaseDate: string | null | undefined): number | null {
  if (!releaseDate) return null;
  const year = Number(releaseDate.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}
