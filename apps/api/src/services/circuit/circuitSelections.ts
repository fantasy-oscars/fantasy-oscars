import type { Pool } from "pg";
import {
  findCircuitSelection,
  findCreditedPersonId,
  getSelectionCategory,
  insertCircuitSelection,
  type CircuitSelectionIdentity,
  type CircuitSelectionRow
} from "../../data/repositories/circuitSelectionRepository.js";
import { AppError, validationError } from "../../errors.js";
import { syncTmdbMovieById } from "../tmdbSync.js";

/*
 * Selection upsert (ADR 0005, section 5). A selection is created the first
 * time anyone picks a contender and is then shared by every league of the
 * Circuit. Any TMDB film qualifies, whatever its release date.
 */

export type PublicCircuitSelection = {
  id: number;
  circuit_category_id: number;
  film_tmdb_id: number;
  person_tmdb_id: number | null;
  film: {
    id: number;
    title: string;
    release_year: number | null;
    poster_url: string | null;
  };
  person: { id: number; name: string; profile_url: string | null } | null;
};

export function toPublicCircuitSelection(
  row: CircuitSelectionRow
): PublicCircuitSelection {
  return {
    id: row.id,
    circuit_category_id: row.circuit_category_id,
    film_tmdb_id: row.film_tmdb_id,
    person_tmdb_id: row.person_tmdb_id,
    film: {
      id: row.film_id,
      title: row.film_title,
      release_year: row.film_release_year,
      poster_url: row.film_poster_url
    },
    person:
      row.person_id === null
        ? null
        : {
            id: row.person_id,
            name: row.person_name ?? "",
            profile_url: row.person_profile_url
          }
  };
}

/**
 * Returns the selection for this identity, creating it when new. A new
 * selection first syncs the film, its people and its credits from TMDB; an
 * acting selection's person must then be in the stored credits (cast or crew).
 */
export async function upsertCircuitSelection(
  pool: Pool,
  identity: CircuitSelectionIdentity
): Promise<{ selection: PublicCircuitSelection; created: boolean }> {
  const category = await getSelectionCategory(pool, identity.circuit_category_id);
  if (!category || category.circuit_status === "DRAFT") {
    throw new AppError("NOT_FOUND", 404, "Category not found");
  }
  if (category.circuit_status === "ARCHIVED") {
    throw new AppError("CIRCUIT_ARCHIVED", 409, "This season has finished");
  }
  if (category.kind === "ACTING" && identity.person_tmdb_id === null) {
    throw validationError("Choose a person for this category", ["person_tmdb_id"]);
  }
  if (category.kind === "FILM" && identity.person_tmdb_id !== null) {
    throw validationError("This category takes a film only", ["person_tmdb_id"]);
  }

  const existing = await findCircuitSelection(pool, identity);
  if (existing) return { selection: toPublicCircuitSelection(existing), created: false };

  const { filmId } = await syncTmdbMovieById(pool, identity.film_tmdb_id);

  let personId: number | null = null;
  if (identity.person_tmdb_id !== null) {
    personId = await findCreditedPersonId(pool, filmId, identity.person_tmdb_id);
    if (personId === null) {
      throw new AppError(
        "PERSON_NOT_IN_CREDITS",
        422,
        "That person isn't in this film's credits"
      );
    }
  }

  const { row, inserted } = await insertCircuitSelection(pool, {
    ...identity,
    film_id: filmId,
    person_id: personId
  });
  return { selection: toPublicCircuitSelection(row), created: inserted };
}
