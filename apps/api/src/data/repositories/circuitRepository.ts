import { type DbClient, query } from "../db.js";
import type { CircuitCategoryKind, CircuitCeremonyDates } from "../../domain/circuit.js";

// Dates are whole days; `::text` keeps them as `YYYY-MM-DD` instead of a
// local-midnight Date.

export type CircuitRow = {
  id: number;
  code: string;
  name: string;
  status: string;
  opens_on: string | null;
  published_at: Date | null;
  activated_at: Date | null;
  archived_at: Date | null;
  created_at: Date;
};

export type CircuitEventRow = {
  id: number;
  circuit_id: number;
  code: string;
  name: string;
  sort_index: number;
  /** An admin-made group; any other event holds exactly one ceremony. */
  is_group: boolean;
};

export type CircuitCategoryRow = {
  id: number;
  circuit_id: number;
  code: string;
  name: string;
  kind: CircuitCategoryKind;
  sort_index: number;
  category_family_id: number | null;
  icon_id: number | null;
  icon_code: string | null;
  icon_variant: string;
};

export type CircuitCeremonyRow = CircuitCeremonyDates & {
  circuit_id: number;
  ceremony_status: string;
  event_name: string;
  event_is_group: boolean;
};

export type CircuitCategoryEditionRow = {
  id: number;
  ceremony_id: number;
  code: string;
  name: string;
  sort_index: number;
  family_id: number | null;
  circuit_category_id: number | null;
};

export type CeremonyCircuitAssociationRow = {
  circuit_id: number;
  circuit_code: string;
  circuit_name: string;
  circuit_status: string;
  circuit_event_id: number;
  event_code: string;
  event_name: string;
  /** In an admin-made group; otherwise its event is its own, hidden plumbing. */
  event_is_group: boolean;
};

export type CategoryTemplateRow = {
  id: number;
  code: string;
  name: string;
  icon_id: number;
  icon_variant: string;
  default_unit_kind: string;
};

const CIRCUIT_COLUMNS = `c.id::int, c.code, c.name, c.status, c.opens_on::text AS opens_on,
  c.published_at, c.activated_at, c.archived_at, c.created_at`;

const EVENT_COLUMNS = `id::int, circuit_id::int, code, name, sort_index, is_group`;

const CATEGORY_COLUMNS = `cc.id::int, cc.circuit_id::int, cc.code, cc.name, cc.kind,
  cc.sort_index, cc.category_family_id::int, cc.icon_id::int, i.code AS icon_code,
  cc.icon_variant`;

// ---------------------------------------------------------------------------
// Circuit
// ---------------------------------------------------------------------------

export async function listCircuits(
  client: DbClient,
  opts: { excludeStatuses?: string[] } = {}
): Promise<Array<CircuitRow & { ceremony_count: number }>> {
  const { rows } = await query<CircuitRow & { ceremony_count: number }>(
    client,
    `SELECT ${CIRCUIT_COLUMNS},
       (SELECT COUNT(*)::int
        FROM circuit_ceremony cc
        JOIN ceremony cer ON cer.id = cc.ceremony_id AND cer.deleted_at IS NULL
        WHERE cc.circuit_id = c.id) AS ceremony_count
     FROM circuit c
     WHERE NOT (c.status = ANY($1::text[]))
     ORDER BY c.created_at DESC, c.id DESC`,
    [opts.excludeStatuses ?? []]
  );
  return rows;
}

export async function getCircuitById(
  client: DbClient,
  id: number,
  opts: { forUpdate?: boolean; forShare?: boolean } = {}
): Promise<CircuitRow | null> {
  const lock = opts.forUpdate ? "FOR UPDATE" : opts.forShare ? "FOR SHARE" : "";
  const { rows } = await query<CircuitRow>(
    client,
    `SELECT ${CIRCUIT_COLUMNS} FROM circuit c WHERE c.id = $1 ${lock}`,
    [id]
  );
  return rows[0] ?? null;
}

/** Inserts the Circuit row only; a new Circuit has no events and no categories. */
export async function insertCircuit(
  client: DbClient,
  input: { code: string; name: string; opens_on: string | null }
): Promise<CircuitRow> {
  const { rows } = await query<CircuitRow>(
    client,
    `INSERT INTO circuit AS c (code, name, opens_on)
     VALUES ($1, $2, $3)
     RETURNING ${CIRCUIT_COLUMNS}`,
    [input.code, input.name, input.opens_on]
  );
  return rows[0]!;
}

/**
 * DRAFT → PUBLISHED: players see the Circuit and can set up seasons, but no
 * draft starts until it is ACTIVE. Returns null unless the Circuit is DRAFT.
 */
export async function publishCircuit(
  client: DbClient,
  id: number
): Promise<CircuitRow | null> {
  const { rows } = await query<CircuitRow>(
    client,
    `UPDATE circuit AS c
     SET status = 'PUBLISHED', published_at = now()
     WHERE c.id = $1 AND c.status = 'DRAFT'
     RETURNING ${CIRCUIT_COLUMNS}`,
    [id]
  );
  return rows[0] ?? null;
}

/** PUBLISHED → DRAFT. Returns null unless the Circuit is PUBLISHED. */
export async function unpublishCircuit(
  client: DbClient,
  id: number
): Promise<CircuitRow | null> {
  const { rows } = await query<CircuitRow>(
    client,
    `UPDATE circuit AS c
     SET status = 'DRAFT', published_at = NULL
     WHERE c.id = $1 AND c.status = 'PUBLISHED'
     RETURNING ${CIRCUIT_COLUMNS}`,
    [id]
  );
  return rows[0] ?? null;
}

/** Every season set up against the Circuit, whatever its status. */
export async function countCircuitLeagues(
  client: DbClient,
  circuitId: number
): Promise<number> {
  const { rows } = await query<{ count: number }>(
    client,
    `SELECT COUNT(*)::int AS count FROM circuit_league WHERE circuit_id = $1`,
    [circuitId]
  );
  return rows[0]?.count ?? 0;
}

/**
 * DRAFT or PUBLISHED → ACTIVE. Returns null when the Circuit is in neither:
 * nothing leaves ACTIVE except archiving.
 */
export async function activateCircuit(
  client: DbClient,
  id: number
): Promise<CircuitRow | null> {
  const { rows } = await query<CircuitRow>(
    client,
    `UPDATE circuit AS c
     SET status = 'ACTIVE', activated_at = now()
     WHERE c.id = $1 AND c.status IN ('DRAFT', 'PUBLISHED')
     RETURNING ${CIRCUIT_COLUMNS}`,
    [id]
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export async function listCircuitEvents(
  client: DbClient,
  circuitId: number
): Promise<CircuitEventRow[]> {
  const { rows } = await query<CircuitEventRow>(
    client,
    `SELECT ${EVENT_COLUMNS}
     FROM circuit_event
     WHERE circuit_id = $1
     ORDER BY sort_index, id`,
    [circuitId]
  );
  return rows;
}

export async function listCircuitEventsForCircuits(
  client: DbClient,
  circuitIds: number[]
): Promise<CircuitEventRow[]> {
  const { rows } = await query<CircuitEventRow>(
    client,
    `SELECT ${EVENT_COLUMNS}
     FROM circuit_event
     WHERE circuit_id = ANY($1::bigint[])
     ORDER BY circuit_id, sort_index, id`,
    [circuitIds]
  );
  return rows;
}

export async function getCircuitEvent(
  client: DbClient,
  circuitId: number,
  eventId: number
): Promise<CircuitEventRow | null> {
  const { rows } = await query<CircuitEventRow>(
    client,
    `SELECT ${EVENT_COLUMNS}
     FROM circuit_event
     WHERE circuit_id = $1 AND id = $2`,
    [circuitId, eventId]
  );
  return rows[0] ?? null;
}

/** Appends an event after the Circuit's last one. */
export async function insertCircuitEvent(
  client: DbClient,
  input: { circuitId: number; code: string; name: string; isGroup: boolean }
): Promise<CircuitEventRow> {
  const { rows } = await query<CircuitEventRow>(
    client,
    `INSERT INTO circuit_event (circuit_id, code, name, is_group, sort_index)
     SELECT $1, $2, $3, $4, COALESCE(MAX(sort_index) + 1, 0)
     FROM circuit_event WHERE circuit_id = $1
     RETURNING ${EVENT_COLUMNS}`,
    [input.circuitId, input.code, input.name, input.isGroup]
  );
  return rows[0]!;
}

export async function updateCircuitEvent(
  client: DbClient,
  input: { circuitId: number; eventId: number; name?: string; code?: string }
): Promise<CircuitEventRow | null> {
  const { rows } = await query<CircuitEventRow>(
    client,
    `UPDATE circuit_event
     SET name = COALESCE($3, name), code = COALESCE($4, code)
     WHERE circuit_id = $1 AND id = $2
     RETURNING ${EVENT_COLUMNS}`,
    [input.circuitId, input.eventId, input.name ?? null, input.code ?? null]
  );
  return rows[0] ?? null;
}

export async function deleteCircuitEvent(
  client: DbClient,
  circuitId: number,
  eventId: number
): Promise<boolean> {
  const res = await query(
    client,
    `DELETE FROM circuit_event WHERE circuit_id = $1 AND id = $2`,
    [circuitId, eventId]
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Deletes a one-ceremony event when no ceremony is left in it; true when it
 * was deleted. Groups stay, empty or not.
 */
export async function deleteCircuitEventIfEmpty(
  client: DbClient,
  circuitId: number,
  eventId: number
): Promise<boolean> {
  const res = await query(
    client,
    `DELETE FROM circuit_event e
     WHERE e.circuit_id = $1 AND e.id = $2
       AND NOT e.is_group
       AND NOT EXISTS (
         SELECT 1 FROM circuit_ceremony cc WHERE cc.circuit_event_id = e.id
       )`,
    [circuitId, eventId]
  );
  return (res.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function listCircuitCategories(
  client: DbClient,
  circuitId: number
): Promise<CircuitCategoryRow[]> {
  const { rows } = await query<CircuitCategoryRow>(
    client,
    `SELECT ${CATEGORY_COLUMNS}
     FROM circuit_category cc
     LEFT JOIN icon i ON i.id = cc.icon_id
     WHERE cc.circuit_id = $1
     ORDER BY cc.sort_index, cc.id`,
    [circuitId]
  );
  return rows;
}

export async function getCircuitCategory(
  client: DbClient,
  circuitId: number,
  categoryId: number
): Promise<CircuitCategoryRow | null> {
  const { rows } = await query<CircuitCategoryRow>(
    client,
    `SELECT ${CATEGORY_COLUMNS}
     FROM circuit_category cc
     LEFT JOIN icon i ON i.id = cc.icon_id
     WHERE cc.circuit_id = $1 AND cc.id = $2`,
    [circuitId, categoryId]
  );
  return rows[0] ?? null;
}

/** A category template (shared reference data). */
export async function getCategoryTemplate(
  client: DbClient,
  familyId: number
): Promise<CategoryTemplateRow | null> {
  const { rows } = await query<CategoryTemplateRow>(
    client,
    `SELECT id::int, code, name, icon_id::int, icon_variant, default_unit_kind
     FROM category_family
     WHERE id = $1`,
    [familyId]
  );
  return rows[0] ?? null;
}

/** Appends a category after the Circuit's last one. */
export async function insertCircuitCategory(
  client: DbClient,
  input: {
    circuitId: number;
    code: string;
    name: string;
    kind: CircuitCategoryKind;
    categoryFamilyId: number;
    iconId: number;
    iconVariant: string;
  }
): Promise<number> {
  const { rows } = await query<{ id: number }>(
    client,
    `INSERT INTO circuit_category
       (circuit_id, code, name, kind, category_family_id, icon_id, icon_variant, sort_index)
     SELECT $1, $2, $3, $4, $5, $6, $7, COALESCE(MAX(sort_index) + 1, 0)
     FROM circuit_category WHERE circuit_id = $1
     RETURNING id::int`,
    [
      input.circuitId,
      input.code,
      input.name,
      input.kind,
      input.categoryFamilyId,
      input.iconId,
      input.iconVariant
    ]
  );
  return rows[0]!.id;
}

export async function renameCircuitCategory(
  client: DbClient,
  input: { circuitId: number; categoryId: number; name: string }
): Promise<boolean> {
  const res = await query(
    client,
    `UPDATE circuit_category SET name = $3 WHERE circuit_id = $1 AND id = $2`,
    [input.circuitId, input.categoryId, input.name]
  );
  return (res.rowCount ?? 0) > 0;
}

/** An icon's id by its code, or null when no template icon has that code. */
export async function findIconIdByCode(
  client: DbClient,
  code: string
): Promise<number | null> {
  const { rows } = await query<{ id: number }>(
    client,
    `SELECT id::int FROM icon WHERE code = $1`,
    [code]
  );
  return rows[0]?.id ?? null;
}

export async function setCircuitCategoryIcon(
  client: DbClient,
  input: { circuitId: number; categoryId: number; iconId: number }
): Promise<void> {
  await query(
    client,
    `UPDATE circuit_category SET icon_id = $3 WHERE circuit_id = $1 AND id = $2`,
    [input.circuitId, input.categoryId, input.iconId]
  );
}

/** Deletes a category; its mappings go with it. Returns the mappings removed, or null. */
export async function deleteCircuitCategory(
  client: DbClient,
  circuitId: number,
  categoryId: number
): Promise<number | null> {
  const mappings = await query(
    client,
    `DELETE FROM circuit_mapping WHERE circuit_id = $1 AND circuit_category_id = $2`,
    [circuitId, categoryId]
  );
  const res = await query(
    client,
    `DELETE FROM circuit_category WHERE circuit_id = $1 AND id = $2`,
    [circuitId, categoryId]
  );
  return (res.rowCount ?? 0) > 0 ? (mappings.rowCount ?? 0) : null;
}

/** Sets sort_index from each id's position; ids are checked by the caller. */
export async function reorderCircuitRows(
  client: DbClient,
  table: "circuit_event" | "circuit_category",
  circuitId: number,
  ids: number[]
): Promise<void> {
  await query(
    client,
    `UPDATE ${table} t
     SET sort_index = o.ord - 1
     FROM unnest($2::bigint[]) WITH ORDINALITY AS o(id, ord)
     WHERE t.circuit_id = $1 AND t.id = o.id`,
    [circuitId, ids]
  );
}

/** Codes already used in a Circuit's events or categories. */
export async function listCircuitCodes(
  client: DbClient,
  table: "circuit_event" | "circuit_category",
  circuitId: number
): Promise<string[]> {
  const { rows } = await query<{ code: string }>(
    client,
    `SELECT code FROM ${table} WHERE circuit_id = $1`,
    [circuitId]
  );
  return rows.map((r) => r.code);
}

// ---------------------------------------------------------------------------
// Ceremony association
// ---------------------------------------------------------------------------

/**
 * Associated ceremonies with their event and dates. Deleted ceremonies are
 * left out; `publicOnly` also leaves out ceremonies still in DRAFT.
 */
export async function listCircuitCeremonies(
  client: DbClient,
  circuitId: number,
  opts: { publicOnly?: boolean } = {}
): Promise<CircuitCeremonyRow[]> {
  const { rows } = await query<CircuitCeremonyRow>(
    client,
    `SELECT
       cc.circuit_id::int,
       c.id::int AS ceremony_id,
       c.code AS ceremony_code,
       c.name AS ceremony_name,
       c.status AS ceremony_status,
       c.nominations_on::text AS nominations_on,
       c.starts_at,
       e.id::int AS circuit_event_id,
       e.code AS event_code,
       e.name AS event_name,
       e.sort_index AS event_sort_index,
       e.is_group AS event_is_group,
       cc.sort_index
     FROM circuit_ceremony cc
     JOIN ceremony c ON c.id = cc.ceremony_id AND c.deleted_at IS NULL
     JOIN circuit_event e ON e.id = cc.circuit_event_id
     WHERE cc.circuit_id = $1
       AND ($2::boolean IS FALSE OR c.status <> 'DRAFT')
     ORDER BY e.sort_index, cc.sort_index, c.id`,
    [circuitId, opts.publicOnly ?? false]
  );
  return rows;
}

/** Category editions of the Circuit's associated ceremonies, with their mapping. */
export async function listCircuitCategoryEditions(
  client: DbClient,
  circuitId: number
): Promise<CircuitCategoryEditionRow[]> {
  const { rows } = await query<CircuitCategoryEditionRow>(
    client,
    `SELECT
       ce.id::int,
       ce.ceremony_id::int,
       ce.code,
       ce.name,
       ce.sort_index,
       ce.family_id::int AS family_id,
       m.circuit_category_id::int AS circuit_category_id
     FROM circuit_ceremony cc
     JOIN ceremony c ON c.id = cc.ceremony_id AND c.deleted_at IS NULL
     JOIN category_edition ce ON ce.ceremony_id = cc.ceremony_id
     LEFT JOIN circuit_mapping m
       ON m.circuit_id = cc.circuit_id AND m.category_edition_id = ce.id
     WHERE cc.circuit_id = $1
     ORDER BY ce.ceremony_id, ce.sort_index, ce.id`,
    [circuitId]
  );
  return rows;
}

export async function listCeremonyCircuitAssociations(
  client: DbClient,
  ceremonyId: number
): Promise<CeremonyCircuitAssociationRow[]> {
  const { rows } = await query<CeremonyCircuitAssociationRow>(
    client,
    `SELECT
       c.id::int AS circuit_id,
       c.code AS circuit_code,
       c.name AS circuit_name,
       c.status AS circuit_status,
       e.id::int AS circuit_event_id,
       e.code AS event_code,
       e.name AS event_name,
       e.is_group AS event_is_group
     FROM circuit_ceremony cc
     JOIN circuit c ON c.id = cc.circuit_id
     JOIN circuit_event e ON e.id = cc.circuit_event_id
     WHERE cc.ceremony_id = $1
     ORDER BY c.created_at DESC, c.id DESC`,
    [ceremonyId]
  );
  return rows;
}

/** The ceremony's event in this Circuit, locking the association; null when not associated. */
export async function getCircuitCeremonyEventId(
  client: DbClient,
  circuitId: number,
  ceremonyId: number
): Promise<number | null> {
  const { rows } = await query<{ circuit_event_id: number }>(
    client,
    `SELECT circuit_event_id::int FROM circuit_ceremony
     WHERE circuit_id = $1 AND ceremony_id = $2
     FOR UPDATE`,
    [circuitId, ceremonyId]
  );
  return rows[0]?.circuit_event_id ?? null;
}

/** Ceremonies in one event, in their order. */
export async function listEventCeremonyIds(
  client: DbClient,
  circuitId: number,
  eventId: number
): Promise<number[]> {
  const { rows } = await query<{ ceremony_id: number }>(
    client,
    `SELECT ceremony_id::int FROM circuit_ceremony
     WHERE circuit_id = $1 AND circuit_event_id = $2
     ORDER BY sort_index, ceremony_id`,
    [circuitId, eventId]
  );
  return rows.map((r) => r.ceremony_id);
}

/**
 * Creates or moves an association. A ceremony new to the event goes after its
 * last ceremony; one already in it keeps its place.
 */
export async function upsertCircuitCeremony(
  client: DbClient,
  input: { circuitId: number; ceremonyId: number; circuitEventId: number }
): Promise<void> {
  await query(
    client,
    `INSERT INTO circuit_ceremony (circuit_id, ceremony_id, circuit_event_id, sort_index)
     SELECT $1, $2, $3, COALESCE(MAX(sort_index) + 1, 0)
     FROM circuit_ceremony WHERE circuit_id = $1 AND circuit_event_id = $3
     ON CONFLICT (circuit_id, ceremony_id)
     DO UPDATE SET
       circuit_event_id = EXCLUDED.circuit_event_id,
       sort_index = CASE
         WHEN circuit_ceremony.circuit_event_id = EXCLUDED.circuit_event_id
           THEN circuit_ceremony.sort_index
         ELSE EXCLUDED.sort_index
       END`,
    [input.circuitId, input.ceremonyId, input.circuitEventId]
  );
}

/** Sets the ceremonies' order inside one event; ids are checked by the caller. */
export async function reorderEventCeremonies(
  client: DbClient,
  circuitId: number,
  eventId: number,
  ceremonyIds: number[]
): Promise<void> {
  await query(
    client,
    `UPDATE circuit_ceremony cc
     SET sort_index = o.ord - 1
     FROM unnest($3::bigint[]) WITH ORDINALITY AS o(id, ord)
     WHERE cc.circuit_id = $1 AND cc.circuit_event_id = $2 AND cc.ceremony_id = o.id`,
    [circuitId, eventId, ceremonyIds]
  );
}

/** Removes an association and the Circuit's mappings of that ceremony's categories. */
export async function deleteCircuitCeremony(
  client: DbClient,
  circuitId: number,
  ceremonyId: number
): Promise<{ removed: boolean; mappings_removed: number }> {
  const mappings = await query(
    client,
    `DELETE FROM circuit_mapping m
     USING category_edition ce
     WHERE m.circuit_id = $1
       AND m.category_edition_id = ce.id
       AND ce.ceremony_id = $2`,
    [circuitId, ceremonyId]
  );
  const removed = await query(
    client,
    `DELETE FROM circuit_ceremony WHERE circuit_id = $1 AND ceremony_id = $2`,
    [circuitId, ceremonyId]
  );
  return {
    removed: (removed.rowCount ?? 0) > 0,
    mappings_removed: mappings.rowCount ?? 0
  };
}

export type CeremonySummary = { id: number; code: string | null; name: string | null };

/** A ceremony's code and name; deleted ceremonies only with `includeDeleted`. */
export async function getCeremonySummary(
  client: DbClient,
  ceremonyId: number,
  opts: { includeDeleted?: boolean } = {}
): Promise<CeremonySummary | null> {
  const { rows } = await query<CeremonySummary>(
    client,
    `SELECT id::int, code, name FROM ceremony
     WHERE id = $1 AND ($2::boolean OR deleted_at IS NULL)`,
    [ceremonyId, opts.includeDeleted ?? false]
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Mappings
// ---------------------------------------------------------------------------

export async function isCeremonyInCircuit(
  client: DbClient,
  circuitId: number,
  ceremonyId: number
): Promise<boolean> {
  const { rows } = await query(
    client,
    `SELECT 1 FROM circuit_ceremony WHERE circuit_id = $1 AND ceremony_id = $2`,
    [circuitId, ceremonyId]
  );
  return rows.length > 0;
}

/** Maps a ceremony category, replacing its earlier mapping in this Circuit. */
export async function upsertCircuitMapping(
  client: DbClient,
  input: { circuitId: number; categoryEditionId: number; circuitCategoryId: number }
): Promise<void> {
  await query(
    client,
    `INSERT INTO circuit_mapping (circuit_id, category_edition_id, circuit_category_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (circuit_id, category_edition_id)
     DO UPDATE SET circuit_category_id = EXCLUDED.circuit_category_id`,
    [input.circuitId, input.categoryEditionId, input.circuitCategoryId]
  );
}

export async function deleteCircuitMapping(
  client: DbClient,
  circuitId: number,
  categoryEditionId: number
): Promise<boolean> {
  const res = await query(
    client,
    `DELETE FROM circuit_mapping WHERE circuit_id = $1 AND category_edition_id = $2`,
    [circuitId, categoryEditionId]
  );
  return (res.rowCount ?? 0) > 0;
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

export type InitializedCircuitLeagueRow = {
  circuit_league_id: number;
  league_id: number;
  league_name: string;
  status: string;
};

/** Leagues of the Circuit past SETUP: their membership and scoring are in play. */
export async function listInitializedCircuitLeagues(
  client: DbClient,
  circuitId: number
): Promise<InitializedCircuitLeagueRow[]> {
  const { rows } = await query<InitializedCircuitLeagueRow>(
    client,
    `SELECT cl.id::int AS circuit_league_id, cl.league_id::int,
       l.name AS league_name, cl.status
     FROM circuit_league cl
     JOIN league l ON l.id = cl.league_id
     WHERE cl.circuit_id = $1 AND cl.status <> 'SETUP'
     ORDER BY cl.id`,
    [circuitId]
  );
  return rows;
}
