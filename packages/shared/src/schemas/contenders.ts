import { z } from "zod";
import {
  CONTENDER_SEARCH_MAX_LENGTH,
  CONTENDER_SEARCH_MIN_LENGTH,
  normalizeContenderQuery
} from "../contenders.js";
import { positiveIdString, positiveIdValue } from "./common.js";

/*
 * Contender search request schemas (signed-in players, TMDB-backed).
 */

export {
  CONTENDER_SEARCH_MAX_LENGTH,
  CONTENDER_SEARCH_MIN_LENGTH,
  normalizeContenderQuery
} from "../contenders.js";

/** `?q=` film search; repeated or non-string values count as empty. */
export const contenderSearchQuery = z.object({
  q: z.unknown().transform((v, ctx) => {
    const text = typeof v === "string" ? normalizeContenderQuery(v) : "";
    if (text.length < CONTENDER_SEARCH_MIN_LENGTH) {
      ctx.addIssue({
        code: "custom",
        message: `Type at least ${CONTENDER_SEARCH_MIN_LENGTH} characters to search`
      });
      return z.NEVER;
    }
    if (text.length > CONTENDER_SEARCH_MAX_LENGTH) {
      ctx.addIssue({
        code: "custom",
        message: `Search must be ${CONTENDER_SEARCH_MAX_LENGTH} characters or fewer`
      });
      return z.NEVER;
    }
    return text;
  })
});

/** `/films/:tmdbId/...` */
export const contenderFilmParam = z.object({
  tmdbId: positiveIdString("TMDB ID must be a positive whole number")
});

/**
 * A selection upsert: a Circuit category and a TMDB film, plus a TMDB person
 * for acting categories. Whether a person is needed depends on the category.
 * With `circuit_league_id`, the response also says who holds the selection
 * in that league.
 */
export const contenderSelectionBody = z.object({
  circuit_category_id: positiveIdValue("Choose a category"),
  film_tmdb_id: positiveIdValue("Choose a film"),
  person_tmdb_id: positiveIdValue("Choose a person")
    .nullish()
    .transform((v) => v ?? null),
  circuit_league_id: positiveIdValue("Choose a season").optional()
});
