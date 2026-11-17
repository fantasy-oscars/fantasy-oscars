import { type DbClient, query } from "../db.js";
import type { CircuitCategoryKind } from "../../domain/circuit.js";

/*
 * Circuit selections (ADR 0005, section 5). Rows are immutable: this module
 * inserts and reads them and has no update.
 */

export type CircuitSelectionIdentity = {
  circuit_category_id: number;
  film_tmdb_id: number;
  person_tmdb_id: number | null;
};

export type CircuitSelectionRow = CircuitSelectionIdentity & {
  id: number;
  film_id: number;
  person_id: number | null;
  created_at: Date;
  film_title: string;
  film_release_year: number | null;
  film_poster_url: string | null;
  person_name: string | null;
  person_profile_url: string | null;
};

export type SelectionCategoryRow = {
  id: number;
  circuit_id: number;
  kind: CircuitCategoryKind;
  circuit_status: string;
};

const SELECTION_COLUMNS = `
  s.id::int,
  s.circuit_category_id::int,
  s.film_tmdb_id,
  s.person_tmdb_id,
  s.film_id::int,
  s.person_id::int,
  s.created_at,
  f.title AS film_title,
  f.release_year AS film_release_year,
  f.poster_url AS film_poster_url,
  p.full_name AS person_name,
  p.profile_url AS person_profile_url`;

/** A Circuit category with its kind and its Circuit's status. */
export async function getSelectionCategory(
  client: DbClient,
  categoryId: number
): Promise<SelectionCategoryRow | null> {
  const { rows } = await query<SelectionCategoryRow>(
    client,
    `SELECT cc.id::int, cc.circuit_id::int, cc.kind, c.status AS circuit_status
     FROM circuit_category cc
     JOIN circuit c ON c.id = cc.circuit_id
     WHERE cc.id = $1`,
    [categoryId]
  );
  return rows[0] ?? null;
}

export async function findCircuitSelection(
  client: DbClient,
  identity: CircuitSelectionIdentity
): Promise<CircuitSelectionRow | null> {
  const { rows } = await query<CircuitSelectionRow>(
    client,
    `SELECT ${SELECTION_COLUMNS}
     FROM circuit_selection s
     JOIN film f ON f.id = s.film_id
     LEFT JOIN person p ON p.id = s.person_id
     WHERE s.circuit_category_id = $1
       AND s.film_tmdb_id = $2
       AND s.person_tmdb_id IS NOT DISTINCT FROM $3`,
    [identity.circuit_category_id, identity.film_tmdb_id, identity.person_tmdb_id]
  );
  return rows[0] ?? null;
}

/** Selections by id, in no particular order; unknown ids are skipped. */
export async function listCircuitSelectionsByIds(
  client: DbClient,
  ids: readonly number[]
): Promise<CircuitSelectionRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<CircuitSelectionRow>(
    client,
    `SELECT ${SELECTION_COLUMNS}
     FROM circuit_selection s
     JOIN film f ON f.id = s.film_id
     LEFT JOIN person p ON p.id = s.person_id
     WHERE s.id = ANY($1::bigint[])`,
    [ids]
  );
  return rows;
}

/**
 * Inserts a selection unless its identity exists, then returns the stored row
 * either way, so concurrent upserts of one identity share one row. `inserted`
 * is false when the row already existed.
 */
export async function insertCircuitSelection(
  client: DbClient,
  input: CircuitSelectionIdentity & { film_id: number; person_id: number | null }
): Promise<{ row: CircuitSelectionRow; inserted: boolean }> {
  const { rowCount } = await query(
    client,
    `INSERT INTO circuit_selection
       (circuit_category_id, film_tmdb_id, person_tmdb_id, film_id, person_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT ON CONSTRAINT circuit_selection_identity_key DO NOTHING`,
    [
      input.circuit_category_id,
      input.film_tmdb_id,
      input.person_tmdb_id,
      input.film_id,
      input.person_id
    ]
  );
  const row = await findCircuitSelection(client, input);
  if (!row) throw new Error("circuit_selection row missing after insert");
  return { row, inserted: (rowCount ?? 0) > 0 };
}

/**
 * The local person with this TMDB id when the film's stored credits list them,
 * as cast or crew; otherwise null.
 */
export async function findCreditedPersonId(
  client: DbClient,
  filmId: number,
  personTmdbId: number
): Promise<number | null> {
  const { rows } = await query<{ id: number }>(
    client,
    `SELECT p.id::int
     FROM film_credit fc
     JOIN person p ON p.id = fc.person_id
     WHERE fc.film_id = $1 AND p.tmdb_id = $2
     LIMIT 1`,
    [filmId, personTmdbId]
  );
  return rows[0]?.id ?? null;
}
