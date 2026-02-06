export function normalizeForSearch(input: string): string {
  // Normalize to improve user search ergonomics (case-insensitive, accent-insensitive).
  // This must NOT change rendering, only matching behavior.
  return String(input ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function includesNormalized(haystack: string, needle: string): boolean {
  const h = normalizeForSearch(haystack);
  const n = normalizeForSearch(needle);
  if (!n) return true;
  return h.includes(n);
}
