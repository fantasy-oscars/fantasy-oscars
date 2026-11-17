/*
 * Contender search text rules, shared by the API schema and the web picker.
 */

export const CONTENDER_SEARCH_MIN_LENGTH = 2;
export const CONTENDER_SEARCH_MAX_LENGTH = 100;

/**
 * Normalised search text: Unicode NFC, whitespace runs collapsed, trimmed and
 * lower-cased. TMDB search ignores case, so this is both the text sent upstream
 * and the cache key.
 */
export function normalizeContenderQuery(input: string): string {
  return input.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}
