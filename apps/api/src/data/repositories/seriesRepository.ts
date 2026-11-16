import { type DbClient, query } from "../db.js";
import type { SeriesCategoryKind, SeriesCeremonyDates } from "../../domain/series.js";

// Dates are whole days; `::text` keeps them as `YYYY-MM-DD` instead of a
// local-midnight Date.

export type SeriesRow = {
  id: number;
  code: string;
  name: string;
  status: string;
  opens_on: string | null;
  activated_at: Date | null;
  archived_at: Date | null;
  created_at: Date;
};

export type SeriesEventRow = {
  id: number;
  series_id: number;
  code: string;
  name: string;
  sort_index: number;
};

export type SeriesCategoryRow = {
  id: number;
  series_id: number;
  code: string;
  name: string;
  kind: SeriesCategoryKind;
  sort_index: number;
};

export type SeriesCeremonyRow = SeriesCeremonyDates & {
  series_id: number;
  ceremony_status: string;
  event_name: string;
};

export type SeriesCategoryEditionRow = {
  id: number;
  ceremony_id: number;
  code: string;
  name: string;
  sort_index: number;
  series_category_id: number | null;
};

export type CeremonySeriesAssociationRow = {
  series_id: number;
  series_code: string;
  series_name: string;
  series_status: string;
  series_event_id: number;
  event_code: string;
  event_name: string;
};

const SERIES_COLUMNS = `s.id::int, s.code, s.name, s.status, s.opens_on::text AS opens_on,
  s.activated_at, s.archived_at, s.created_at`;

export async function listSeries(
  client: DbClient,
  opts: { excludeStatuses?: string[] } = {}
): Promise<Array<SeriesRow & { ceremony_count: number }>> {
  const { rows } = await query<SeriesRow & { ceremony_count: number }>(
    client,
    `SELECT ${SERIES_COLUMNS},
       (SELECT COUNT(*)::int
        FROM series_ceremony sc
        JOIN ceremony c ON c.id = sc.ceremony_id AND c.deleted_at IS NULL
        WHERE sc.series_id = s.id) AS ceremony_count
     FROM series s
     WHERE NOT (s.status = ANY($1::text[]))
     ORDER BY s.created_at DESC, s.id DESC`,
    [opts.excludeStatuses ?? []]
  );
  return rows;
}

export async function getSeriesById(
  client: DbClient,
  id: number
): Promise<SeriesRow | null> {
  const { rows } = await query<SeriesRow>(
    client,
    `SELECT ${SERIES_COLUMNS} FROM series s WHERE s.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

/** Inserts the Series row only; the caller adds events and categories in the same transaction. */
export async function insertSeries(
  client: DbClient,
  input: { code: string; name: string; opens_on: string | null }
): Promise<SeriesRow> {
  const { rows } = await query<SeriesRow>(
    client,
    `INSERT INTO series AS s (code, name, opens_on)
     VALUES ($1, $2, $3)
     RETURNING ${SERIES_COLUMNS}`,
    [input.code, input.name, input.opens_on]
  );
  return rows[0]!;
}

export async function insertSeriesEvents(
  client: DbClient,
  seriesId: number,
  events: Array<{ code: string; name: string; sort_index: number }>
): Promise<void> {
  await query(
    client,
    `INSERT INTO series_event (series_id, code, name, sort_index)
     SELECT $1, e.code, e.name, e.sort_index
     FROM jsonb_to_recordset($2::jsonb) AS e(code text, name text, sort_index int)`,
    [seriesId, JSON.stringify(events)]
  );
}

export async function insertSeriesCategories(
  client: DbClient,
  seriesId: number,
  categories: Array<{ code: string; name: string; kind: string; sort_index: number }>
): Promise<void> {
  await query(
    client,
    `INSERT INTO series_category (series_id, code, name, kind, sort_index)
     SELECT $1, c.code, c.name, c.kind, c.sort_index
     FROM jsonb_to_recordset($2::jsonb) AS c(code text, name text, kind text, sort_index int)`,
    [seriesId, JSON.stringify(categories)]
  );
}

export async function listSeriesEvents(
  client: DbClient,
  seriesId: number
): Promise<SeriesEventRow[]> {
  const { rows } = await query<SeriesEventRow>(
    client,
    `SELECT id::int, series_id::int, code, name, sort_index
     FROM series_event
     WHERE series_id = $1
     ORDER BY sort_index, id`,
    [seriesId]
  );
  return rows;
}

export async function listSeriesEventsForSeries(
  client: DbClient,
  seriesIds: number[]
): Promise<SeriesEventRow[]> {
  const { rows } = await query<SeriesEventRow>(
    client,
    `SELECT id::int, series_id::int, code, name, sort_index
     FROM series_event
     WHERE series_id = ANY($1::bigint[])
     ORDER BY series_id, sort_index, id`,
    [seriesIds]
  );
  return rows;
}

export async function listSeriesCategories(
  client: DbClient,
  seriesId: number
): Promise<SeriesCategoryRow[]> {
  const { rows } = await query<SeriesCategoryRow>(
    client,
    `SELECT id::int, series_id::int, code, name, kind, sort_index
     FROM series_category
     WHERE series_id = $1
     ORDER BY sort_index, id`,
    [seriesId]
  );
  return rows;
}

/**
 * Associated ceremonies with their event and dates. Deleted ceremonies are
 * left out; `publicOnly` also leaves out ceremonies still in DRAFT.
 */
export async function listSeriesCeremonies(
  client: DbClient,
  seriesId: number,
  opts: { publicOnly?: boolean } = {}
): Promise<SeriesCeremonyRow[]> {
  const { rows } = await query<SeriesCeremonyRow>(
    client,
    `SELECT
       sc.series_id::int,
       c.id::int AS ceremony_id,
       c.code AS ceremony_code,
       c.name AS ceremony_name,
       c.status AS ceremony_status,
       c.nominations_on::text AS nominations_on,
       c.results_on::text AS results_on,
       e.id::int AS series_event_id,
       e.code AS event_code,
       e.name AS event_name,
       e.sort_index AS event_sort_index
     FROM series_ceremony sc
     JOIN ceremony c ON c.id = sc.ceremony_id AND c.deleted_at IS NULL
     JOIN series_event e ON e.id = sc.series_event_id
     WHERE sc.series_id = $1
       AND ($2::boolean IS FALSE OR c.status <> 'DRAFT')
     ORDER BY e.sort_index, c.id`,
    [seriesId, opts.publicOnly ?? false]
  );
  return rows;
}

/** Category editions of the Series' associated ceremonies, with their mapping. */
export async function listSeriesCategoryEditions(
  client: DbClient,
  seriesId: number
): Promise<SeriesCategoryEditionRow[]> {
  const { rows } = await query<SeriesCategoryEditionRow>(
    client,
    `SELECT
       ce.id::int,
       ce.ceremony_id::int,
       ce.code,
       ce.name,
       ce.sort_index,
       m.series_category_id::int AS series_category_id
     FROM series_ceremony sc
     JOIN ceremony c ON c.id = sc.ceremony_id AND c.deleted_at IS NULL
     JOIN category_edition ce ON ce.ceremony_id = sc.ceremony_id
     LEFT JOIN series_mapping m
       ON m.series_id = sc.series_id AND m.category_edition_id = ce.id
     WHERE sc.series_id = $1
     ORDER BY ce.ceremony_id, ce.sort_index, ce.id`,
    [seriesId]
  );
  return rows;
}

export async function listCeremonySeriesAssociations(
  client: DbClient,
  ceremonyId: number
): Promise<CeremonySeriesAssociationRow[]> {
  const { rows } = await query<CeremonySeriesAssociationRow>(
    client,
    `SELECT
       s.id::int AS series_id,
       s.code AS series_code,
       s.name AS series_name,
       s.status AS series_status,
       e.id::int AS series_event_id,
       e.code AS event_code,
       e.name AS event_name
     FROM series_ceremony sc
     JOIN series s ON s.id = sc.series_id
     JOIN series_event e ON e.id = sc.series_event_id
     WHERE sc.ceremony_id = $1
     ORDER BY s.created_at DESC, s.id DESC`,
    [ceremonyId]
  );
  return rows;
}

export async function getSeriesEvent(
  client: DbClient,
  seriesId: number,
  eventId: number
): Promise<SeriesEventRow | null> {
  const { rows } = await query<SeriesEventRow>(
    client,
    `SELECT id::int, series_id::int, code, name, sort_index
     FROM series_event
     WHERE series_id = $1 AND id = $2`,
    [seriesId, eventId]
  );
  return rows[0] ?? null;
}

export async function getSeriesCategory(
  client: DbClient,
  seriesId: number,
  categoryId: number
): Promise<SeriesCategoryRow | null> {
  const { rows } = await query<SeriesCategoryRow>(
    client,
    `SELECT id::int, series_id::int, code, name, kind, sort_index
     FROM series_category
     WHERE series_id = $1 AND id = $2`,
    [seriesId, categoryId]
  );
  return rows[0] ?? null;
}

export async function isCeremonyInSeries(
  client: DbClient,
  seriesId: number,
  ceremonyId: number
): Promise<boolean> {
  const { rows } = await query(
    client,
    `SELECT 1 FROM series_ceremony WHERE series_id = $1 AND ceremony_id = $2`,
    [seriesId, ceremonyId]
  );
  return rows.length > 0;
}

/** Creates or moves an association; `created` is false when it already existed. */
export async function upsertSeriesCeremony(
  client: DbClient,
  input: { seriesId: number; ceremonyId: number; seriesEventId: number }
): Promise<{ created: boolean; previous_event_id: number | null }> {
  const { rows: before } = await query<{ series_event_id: number }>(
    client,
    `SELECT series_event_id::int FROM series_ceremony
     WHERE series_id = $1 AND ceremony_id = $2
     FOR UPDATE`,
    [input.seriesId, input.ceremonyId]
  );
  await query(
    client,
    `INSERT INTO series_ceremony (series_id, ceremony_id, series_event_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (series_id, ceremony_id)
     DO UPDATE SET series_event_id = EXCLUDED.series_event_id`,
    [input.seriesId, input.ceremonyId, input.seriesEventId]
  );
  return {
    created: before.length === 0,
    previous_event_id: before[0]?.series_event_id ?? null
  };
}

/** Removes an association and the Series' mappings of that ceremony's categories. */
export async function deleteSeriesCeremony(
  client: DbClient,
  seriesId: number,
  ceremonyId: number
): Promise<{ removed: boolean; mappings_removed: number }> {
  const mappings = await query(
    client,
    `DELETE FROM series_mapping m
     USING category_edition ce
     WHERE m.series_id = $1
       AND m.category_edition_id = ce.id
       AND ce.ceremony_id = $2`,
    [seriesId, ceremonyId]
  );
  const removed = await query(
    client,
    `DELETE FROM series_ceremony WHERE series_id = $1 AND ceremony_id = $2`,
    [seriesId, ceremonyId]
  );
  return {
    removed: (removed.rowCount ?? 0) > 0,
    mappings_removed: mappings.rowCount ?? 0
  };
}

export async function upsertSeriesMapping(
  client: DbClient,
  input: { seriesId: number; categoryEditionId: number; seriesCategoryId: number }
): Promise<void> {
  await query(
    client,
    `INSERT INTO series_mapping (series_id, category_edition_id, series_category_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (series_id, category_edition_id)
     DO UPDATE SET series_category_id = EXCLUDED.series_category_id`,
    [input.seriesId, input.categoryEditionId, input.seriesCategoryId]
  );
}

export async function deleteSeriesMapping(
  client: DbClient,
  seriesId: number,
  categoryEditionId: number
): Promise<boolean> {
  const res = await query(
    client,
    `DELETE FROM series_mapping WHERE series_id = $1 AND category_edition_id = $2`,
    [seriesId, categoryEditionId]
  );
  return (res.rowCount ?? 0) > 0;
}

/** DRAFT → ACTIVE. Returns null when the Series is not in DRAFT. */
export async function activateSeries(
  client: DbClient,
  id: number
): Promise<SeriesRow | null> {
  const { rows } = await query<SeriesRow>(
    client,
    `UPDATE series AS s
     SET status = 'ACTIVE', activated_at = now()
     WHERE s.id = $1 AND s.status = 'DRAFT'
     RETURNING ${SERIES_COLUMNS}`,
    [id]
  );
  return rows[0] ?? null;
}

export async function ceremonyExists(client: DbClient, ceremonyId: number) {
  const { rows } = await query(
    client,
    `SELECT 1 FROM ceremony WHERE id = $1 AND deleted_at IS NULL`,
    [ceremonyId]
  );
  return rows.length > 0;
}

export async function getCategoryEditionCeremonyId(
  client: DbClient,
  categoryEditionId: number
): Promise<number | null> {
  const { rows } = await query<{ ceremony_id: number }>(
    client,
    `SELECT ceremony_id::int FROM category_edition WHERE id = $1`,
    [categoryEditionId]
  );
  return rows[0]?.ceremony_id ?? null;
}
