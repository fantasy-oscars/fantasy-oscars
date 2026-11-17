/*
 * Selection matching (ADR 0005, section 5; ADR 0006, section 5). Pure: no IO.
 *
 * Given one scoring occasion (a ceremony and NOMINATION or WIN), the Circuit's
 * mappings for that ceremony's categories and the ceremony's nominations,
 * decides which selections the occasion matches. Nothing is fuzzy: a match
 * needs the mapped Circuit category, the film's TMDB id after consolidation
 * and, for ACTING, the person's TMDB id.
 */

import type { CircuitCategoryKind } from "./circuit.js";

export type OccasionKind = "NOMINATION" | "WIN";

export type MatchSelection = {
  id: number;
  circuit_category_id: number;
  kind: CircuitCategoryKind;
  film_tmdb_id: number;
  person_tmdb_id: number | null;
};

export type MatchFilm = {
  id: number;
  tmdb_id: number | null;
  consolidated_into_film_id: number | null;
};

export type MatchNomination = {
  id: number;
  category_edition_id: number;
  /** The nominated film: the nomination's own, or its performance's. */
  film_id: number | null;
  status: string;
  /** TMDB ids of the nomination's contributor people. */
  person_tmdb_ids: readonly number[];
};

export type MatchMapping = {
  category_edition_id: number;
  circuit_category_id: number;
};

export type MatchOccasionInput = {
  kind: OccasionKind;
  /** Mappings of the ceremony's categories; unmapped editions never match. */
  mappings: readonly MatchMapping[];
  nominations: readonly MatchNomination[];
  /** Winning nomination ids of the ceremony; used only for WIN. */
  winner_nomination_ids?: readonly number[];
  films: readonly MatchFilm[];
  selections: readonly MatchSelection[];
};

export type SelectionMatch = {
  selection_id: number;
  /** Every matching nomination, ascending. The selection scores once. */
  nomination_ids: number[];
};

/**
 * The TMDB id of a film after following `consolidated_into_film_id` to the
 * surviving film. Null when the film is unknown, has no TMDB id or the chain
 * loops.
 */
export function canonicalFilmTmdbId(
  filmId: number,
  filmsById: ReadonlyMap<number, MatchFilm>
): number | null {
  const seen = new Set<number>();
  let film = filmsById.get(filmId);
  while (film && film.consolidated_into_film_id !== null) {
    if (seen.has(film.id)) return null;
    seen.add(film.id);
    film = filmsById.get(film.consolidated_into_film_id);
  }
  return film?.tmdb_id ?? null;
}

/**
 * The selections an occasion matches, at most one entry per selection however
 * many mapped categories nominate it. Ordered by selection id.
 */
export function matchOccasion(input: MatchOccasionInput): SelectionMatch[] {
  const circuitCategoryByEdition = new Map(
    input.mappings.map((m) => [m.category_edition_id, m.circuit_category_id])
  );
  const filmsById = new Map(input.films.map((f) => [f.id, f]));
  const winners = new Set(input.winner_nomination_ids ?? []);

  // circuit category id -> film tmdb id -> nominations
  const index = new Map<number, Map<number, MatchNomination[]>>();
  for (const nomination of input.nominations) {
    if (nomination.status !== "ACTIVE") continue;
    if (input.kind === "WIN" && !winners.has(nomination.id)) continue;
    const circuitCategoryId = circuitCategoryByEdition.get(
      nomination.category_edition_id
    );
    if (circuitCategoryId === undefined || nomination.film_id === null) continue;
    const filmTmdbId = canonicalFilmTmdbId(nomination.film_id, filmsById);
    if (filmTmdbId === null) continue;
    let byFilm = index.get(circuitCategoryId);
    if (!byFilm) {
      byFilm = new Map();
      index.set(circuitCategoryId, byFilm);
    }
    const list = byFilm.get(filmTmdbId) ?? [];
    list.push(nomination);
    byFilm.set(filmTmdbId, list);
  }

  const matches: SelectionMatch[] = [];
  for (const selection of [...input.selections].sort((a, b) => a.id - b.id)) {
    const candidates =
      index.get(selection.circuit_category_id)?.get(selection.film_tmdb_id) ?? [];
    const personTmdbId = selection.person_tmdb_id;
    const matching =
      selection.kind === "ACTING"
        ? personTmdbId === null
          ? []
          : candidates.filter((n) => n.person_tmdb_ids.includes(personTmdbId))
        : candidates;
    if (matching.length === 0) continue;
    matches.push({
      selection_id: selection.id,
      nomination_ids: [...new Set(matching.map((n) => n.id))].sort((a, b) => a - b)
    });
  }
  return matches;
}
