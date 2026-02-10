export function formatFilmLabel(f: {
  title: string;
  release_year: number | null;
  tmdb_id: number | null;
}) {
  const year = typeof f.release_year === "number" ? ` (${f.release_year})` : "";
  const tmdb = typeof f.tmdb_id === "number" && f.tmdb_id ? ` · TMDB ${f.tmdb_id}` : "";
  return `${f.title}${year}${tmdb}`;
}

