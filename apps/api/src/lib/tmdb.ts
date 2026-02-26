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

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

function requireTmdbReadToken(env: NodeJS.ProcessEnv = process.env): string {
  // Backwards-compatible: we previously used `TMDB_API_TOKEN` locally/ops.
  // Prefer the explicit "read access token" name going forward.
  const token = env.TMDB_READ_ACCESS_TOKEN ?? env.TMDB_API_TOKEN;
  if (!token || token.trim() === "") {
    throw new Error(
      "TMDB token env var is not set (expected TMDB_READ_ACCESS_TOKEN; falling back to TMDB_API_TOKEN)"
    );
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

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `TMDB request failed (${res.status}) for ${path}${body ? `: ${body}` : ""}`
    );
  }

  return (await res.json()) as T;
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

export async function searchTmdbMovies(queryText: string): Promise<TmdbMovieSearchResult[]> {
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

export function parseReleaseYear(releaseDate: string | null | undefined): number | null {
  if (!releaseDate) return null;
  const year = Number(releaseDate.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}
