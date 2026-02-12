// Search helpers: case-insensitive + accent-insensitive matching (best-effort).
// This must not change rendering, only which results match user queries.

const SEARCH_TRANSLATE_FROM = "áàâäãåæçéèêëíìîïñóòôöõøœßúùûüýÿ";
const SEARCH_TRANSLATE_TO = "aaaaaaaceeeeiiiinooooooosuuuuyy";

export function escapeLike(input: string): string {
  return input.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function normalizeForSearch(input: string): string {
  return String(input ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function sqlNorm(exprSql: string): string {
  return `translate(lower(${exprSql}), '${SEARCH_TRANSLATE_FROM}', '${SEARCH_TRANSLATE_TO}')`;
}
