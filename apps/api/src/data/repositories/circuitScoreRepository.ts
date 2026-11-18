import { type DbClient, query } from "../db.js";
import type { ScoringOccasionKind } from "../../domain/circuit.js";
import type {
  MatchFilm,
  MatchMapping,
  MatchNomination,
  MatchSelection
} from "../../domain/circuitMatching.js";
import type { ScoreEntry } from "../../domain/circuitScoring.js";

/*
 * The Circuit scoring ledger (migration 033) and the reads that feed the pure
 * scoring function. Only services/circuit/circuitScoring.ts writes the
 * ledger, one occasion at a time inside a transaction.
 */

export type ScoringLeagueRow = { id: number; circuit_id: number };

export type ScoringCeremonyRow = {
  ceremony_id: number;
  circuit_event_id: number;
  nominations_on: string | null;
  starts_at: Date | null;
};

export type CeremonyMatchInputs = {
  mappings: MatchMapping[];
  nominations: MatchNomination[];
  winner_nomination_ids: number[];
  films: MatchFilm[];
};

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

export async function getScoringLeague(
  client: DbClient,
  circuitLeagueId: number
): Promise<ScoringLeagueRow | null> {
  const { rows } = await query<ScoringLeagueRow>(
    client,
    `SELECT id::int, circuit_id::int FROM circuit_league WHERE id = $1`,
    [circuitLeagueId]
  );
  return rows[0] ?? null;
}

export async function listScoringLeaguesForCircuit(
  client: DbClient,
  circuitId: number
): Promise<ScoringLeagueRow[]> {
  const { rows } = await query<ScoringLeagueRow>(
    client,
    `SELECT id::int, circuit_id::int FROM circuit_league WHERE circuit_id = $1 ORDER BY id`,
    [circuitId]
  );
  return rows;
}

/** Leagues of every Circuit the ceremony belongs to. */
export async function listScoringLeaguesForCeremony(
  client: DbClient,
  ceremonyId: number
): Promise<ScoringLeagueRow[]> {
  const { rows } = await query<ScoringLeagueRow>(
    client,
    `SELECT cl.id::int, cl.circuit_id::int
     FROM circuit_league cl
     JOIN circuit_ceremony cc ON cc.circuit_id = cl.circuit_id
     WHERE cc.ceremony_id = $1
     ORDER BY cl.id`,
    [ceremonyId]
  );
  return rows;
}

/** Leagues of every Circuit with a ceremony whose occasion of `kind` falls on `day`. */
export async function listScoringOccasionsOnDay(
  client: DbClient,
  day: string
): Promise<
  Array<{ circuit_league_id: number; ceremony_id: number; kind: ScoringOccasionKind }>
> {
  const { rows } = await query<{
    circuit_league_id: number;
    ceremony_id: number;
    kind: ScoringOccasionKind;
  }>(
    client,
    `SELECT cl.id::int AS circuit_league_id, c.id::int AS ceremony_id, k.kind
     FROM circuit_league cl
     JOIN circuit_ceremony cc ON cc.circuit_id = cl.circuit_id
     JOIN ceremony c ON c.id = cc.ceremony_id AND c.deleted_at IS NULL
     CROSS JOIN LATERAL (
       VALUES
         ('NOMINATION', c.nominations_on),
         ('WIN', (c.starts_at AT TIME ZONE 'America/Los_Angeles')::date)
     ) AS k(kind, occasion_date)
     WHERE k.occasion_date = $1::date
     ORDER BY cl.id, c.id, k.kind`,
    [day]
  );
  return rows;
}

/** The Circuit's live ceremony ids; a removed or deleted ceremony is not listed. */
export async function listScoringCeremonyIds(
  client: DbClient,
  circuitId: number
): Promise<number[]> {
  const { rows } = await query<{ ceremony_id: number }>(
    client,
    `SELECT cc.ceremony_id::int
     FROM circuit_ceremony cc
     JOIN ceremony c ON c.id = cc.ceremony_id AND c.deleted_at IS NULL
     WHERE cc.circuit_id = $1
     ORDER BY cc.ceremony_id`,
    [circuitId]
  );
  return rows.map((r) => r.ceremony_id);
}

/** The ceremony's event and dates in the Circuit, or null when it is not a live member. */
export async function getScoringCeremony(
  client: DbClient,
  circuitId: number,
  ceremonyId: number
): Promise<ScoringCeremonyRow | null> {
  const { rows } = await query<ScoringCeremonyRow>(
    client,
    `SELECT c.id::int AS ceremony_id,
            cc.circuit_event_id::int,
            c.nominations_on::text AS nominations_on,
            c.starts_at
     FROM circuit_ceremony cc
     JOIN ceremony c ON c.id = cc.ceremony_id AND c.deleted_at IS NULL
     WHERE cc.circuit_id = $1 AND cc.ceremony_id = $2`,
    [circuitId, ceremonyId]
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Matching inputs
// ---------------------------------------------------------------------------

/**
 * The ceremony's mappings in the Circuit, its nominations (film from the
 * nomination or its performance; people from its contributors and
 * performance), its winners and every film the nominations reach through
 * consolidation.
 */
export async function loadCeremonyMatchInputs(
  client: DbClient,
  circuitId: number,
  ceremonyId: number
): Promise<CeremonyMatchInputs> {
  const { rows: mappings } = await query<MatchMapping>(
    client,
    `SELECT m.category_edition_id::int, m.circuit_category_id::int
     FROM circuit_mapping m
     JOIN category_edition ce ON ce.id = m.category_edition_id
     WHERE m.circuit_id = $1 AND ce.ceremony_id = $2`,
    [circuitId, ceremonyId]
  );
  const { rows: nominations } = await query<MatchNomination>(
    client,
    `SELECT n.id::int,
            n.category_edition_id::int,
            COALESCE(n.film_id, p.film_id)::int AS film_id,
            n.status,
            COALESCE(
              array_agg(DISTINCT pe.tmdb_id) FILTER (WHERE pe.tmdb_id IS NOT NULL),
              '{}'
            )::int[] AS person_tmdb_ids
     FROM nomination n
     JOIN category_edition ce ON ce.id = n.category_edition_id
     LEFT JOIN performance p ON p.id = n.performance_id
     LEFT JOIN nomination_contributor nc ON nc.nomination_id = n.id
     LEFT JOIN person pe ON pe.id = nc.person_id OR pe.id = p.person_id
     WHERE ce.ceremony_id = $1
     GROUP BY n.id, p.film_id
     ORDER BY n.id`,
    [ceremonyId]
  );
  const { rows: winners } = await query<{ nomination_id: number }>(
    client,
    `SELECT DISTINCT nomination_id::int FROM ceremony_winner WHERE ceremony_id = $1`,
    [ceremonyId]
  );
  const { rows: films } = await query<MatchFilm>(
    client,
    `WITH RECURSIVE chain AS (
       SELECT f.id, f.tmdb_id, f.consolidated_into_film_id
       FROM film f
       WHERE f.id IN (
         SELECT COALESCE(n.film_id, p.film_id)
         FROM nomination n
         JOIN category_edition ce ON ce.id = n.category_edition_id
         LEFT JOIN performance p ON p.id = n.performance_id
         WHERE ce.ceremony_id = $1
       )
       UNION
       SELECT f.id, f.tmdb_id, f.consolidated_into_film_id
       FROM film f
       JOIN chain ON f.id = chain.consolidated_into_film_id
     )
     SELECT id::int, tmdb_id::int, consolidated_into_film_id::int FROM chain`,
    [ceremonyId]
  );
  return {
    mappings,
    nominations,
    winner_nomination_ids: winners.map((w) => w.nomination_id),
    films
  };
}

/** Every selection of the Circuit; selections are shared by its leagues. */
export async function listScoringSelections(
  client: DbClient,
  circuitId: number
): Promise<MatchSelection[]> {
  const { rows } = await query<MatchSelection>(
    client,
    `SELECT s.id::int, s.circuit_category_id::int, c.kind,
            s.film_tmdb_id, s.person_tmdb_id
     FROM circuit_selection s
     JOIN circuit_category c ON c.id = s.circuit_category_id
     WHERE c.circuit_id = $1
     ORDER BY s.id`,
    [circuitId]
  );
  return rows;
}

/** Base points of the league's scoring matrix. */
export async function getLeagueBasePoints(
  client: DbClient,
  circuitLeagueId: number
): Promise<{ nomination_points: number; win_bonus_points: number } | null> {
  const { rows } = await query<{ nomination_points: number; win_bonus_points: number }>(
    client,
    `SELECT nomination_points, win_bonus_points FROM circuit_league WHERE id = $1`,
    [circuitLeagueId]
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

/**
 * Serialises rebuilds of one (league, ceremony) until the transaction ends,
 * so two rebuilds never interleave their delete and insert.
 */
export async function lockScoreOccasion(
  tx: DbClient,
  circuitLeagueId: number,
  ceremonyId: number
): Promise<void> {
  await query(tx, `SELECT pg_advisory_xact_lock($1::int, $2::int)`, [
    circuitLeagueId,
    ceremonyId
  ]);
}

export async function deleteScoreEntries(
  tx: DbClient,
  circuitLeagueId: number,
  ceremonyId: number,
  kind: ScoringOccasionKind
): Promise<number> {
  const result = await query(
    tx,
    `DELETE FROM circuit_score_entry
     WHERE circuit_league_id = $1 AND ceremony_id = $2 AND kind = $3`,
    [circuitLeagueId, ceremonyId, kind]
  );
  return result.rowCount ?? 0;
}

/**
 * Removes rows of ceremonies that are no longer live members of the Circuit;
 * returns the ceremonies whose rows went.
 */
export async function deleteDetachedScoreEntries(
  tx: DbClient,
  league: ScoringLeagueRow
): Promise<number[]> {
  const { rows } = await query<{ ceremony_id: number }>(
    tx,
    `DELETE FROM circuit_score_entry e
     WHERE e.circuit_league_id = $1
       AND NOT EXISTS (
         SELECT 1
         FROM circuit_ceremony cc
         JOIN ceremony c ON c.id = cc.ceremony_id AND c.deleted_at IS NULL
         WHERE cc.circuit_id = $2 AND cc.ceremony_id = e.ceremony_id
       )
     RETURNING e.ceremony_id::int`,
    [league.id, league.circuit_id]
  );
  return [...new Set(rows.map((r) => r.ceremony_id))];
}

export async function insertScoreEntries(
  tx: DbClient,
  circuitLeagueId: number,
  entries: readonly ScoreEntry[]
): Promise<void> {
  if (entries.length === 0) return;
  await query(
    tx,
    `INSERT INTO circuit_score_entry
       (circuit_league_id, member_id, selection_id, ceremony_id, kind,
        occasion_date, points, ownership_id)
     SELECT $1, e.member_id, e.selection_id, e.ceremony_id, e.kind,
            e.occasion_date, e.points, e.ownership_id
     FROM unnest(
       $2::bigint[], $3::bigint[], $4::bigint[], $5::text[],
       $6::date[], $7::numeric[], $8::bigint[]
     ) AS e(member_id, selection_id, ceremony_id, kind, occasion_date, points, ownership_id)`,
    [
      circuitLeagueId,
      entries.map((e) => e.member_id),
      entries.map((e) => e.selection_id),
      entries.map((e) => e.ceremony_id),
      entries.map((e) => e.kind),
      entries.map((e) => e.occasion_date),
      entries.map((e) => e.points),
      entries.map((e) => e.ownership_id)
    ]
  );
}

export type ScoreEntryRow = ScoreEntry & { id: number; circuit_league_id: number };

/** The league's ledger, or one ceremony's part of it, for the standings reads. */
export async function listScoreEntries(
  client: DbClient,
  circuitLeagueId: number,
  ceremonyId: number | null = null
): Promise<ScoreEntryRow[]> {
  const { rows } = await query<ScoreEntryRow>(
    client,
    `SELECT id::int, circuit_league_id::int, member_id::int, selection_id::int,
            ceremony_id::int, kind, occasion_date::text AS occasion_date,
            points::float8 AS points, ownership_id::int
     FROM circuit_score_entry
     WHERE circuit_league_id = $1 AND ($2::bigint IS NULL OR ceremony_id = $2)
     ORDER BY ceremony_id, kind, selection_id`,
    [circuitLeagueId, ceremonyId]
  );
  return rows;
}
