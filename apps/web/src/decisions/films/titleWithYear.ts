export function formatFilmTitleWithYear(
  title: string,
  releaseYear?: number | null
): string {
  const year = Number.isFinite(Number(releaseYear)) ? Number(releaseYear) : null;
  return year ? `${title} (${year})` : title;
}

export function parseFilmTitleWithYear(input: string): {
  title: string;
  releaseYear: number | null;
} {
  const trimmed = input.trim();
  // Parse a trailing " (YYYY)" disambiguator.
  const m = trimmed.match(/^(.*?)(?:\\s*\\((\\d{4})\\))\\s*$/);
  if (!m) return { title: trimmed, releaseYear: null };
  const title = (m[1] ?? "").trim();
  const yearRaw = m[2] ?? "";
  const year = Number(yearRaw);
  if (!title || !Number.isFinite(year)) return { title: trimmed, releaseYear: null };
  return { title, releaseYear: year };
}

