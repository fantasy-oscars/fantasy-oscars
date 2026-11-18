import { type DbClient, query } from "../db.js";

/*
 * Circuit draft queues (migration 030): one ordered list of selections per
 * league member. Positions are dense from 1. The unique position key is
 * deferred, so the writes below may pass through duplicate positions inside
 * one transaction. Callers take lockCircuitQueue before they write.
 */

export type CircuitQueueItemRow = { selection_id: number; position: number };

/**
 * Serialises writes to one member's queue for the rest of the transaction, by
 * locking the member row (as acquisitions do). An auto-pick reads the queue in
 * one statement and needs no lock.
 */
export async function lockCircuitQueue(
  client: DbClient,
  memberId: number
): Promise<void> {
  await query(client, `SELECT 1 FROM circuit_league_member WHERE id = $1 FOR UPDATE`, [
    memberId
  ]);
}

export async function listCircuitQueue(
  client: DbClient,
  memberId: number
): Promise<CircuitQueueItemRow[]> {
  const { rows } = await query<CircuitQueueItemRow>(
    client,
    `SELECT selection_id::int, position
     FROM circuit_queue_item
     WHERE member_id = $1
     ORDER BY position`,
    [memberId]
  );
  return rows;
}

/**
 * The queue as the auto-pick reads it: queue order, each selection with its
 * category, limited to selections of the league's Circuit.
 */
export async function listCircuitQueueForAutoPick(
  client: DbClient,
  memberId: number,
  circuitId: number
): Promise<Array<{ selection_id: number; category_id: number }>> {
  const { rows } = await query<{ selection_id: number; category_id: number }>(
    client,
    `SELECT q.selection_id::int, s.circuit_category_id::int AS category_id
     FROM circuit_queue_item q
     JOIN circuit_selection s ON s.id = q.selection_id
     JOIN circuit_category cc ON cc.id = s.circuit_category_id
     WHERE q.member_id = $1 AND cc.circuit_id = $2
     ORDER BY q.position`,
    [memberId, circuitId]
  );
  return rows;
}

/** Adds a selection at the bottom; false when it was already queued. */
export async function appendCircuitQueueItem(
  client: DbClient,
  memberId: number,
  selectionId: number
): Promise<boolean> {
  const { rowCount } = await query(
    client,
    `INSERT INTO circuit_queue_item (member_id, selection_id, position)
     SELECT $1, $2, COALESCE(MAX(position), 0) + 1
     FROM circuit_queue_item WHERE member_id = $1
     ON CONFLICT (member_id, selection_id) DO NOTHING`,
    [memberId, selectionId]
  );
  return (rowCount ?? 0) > 0;
}

/** Removes a selection and closes the gap; false when it was not queued. */
export async function deleteCircuitQueueItem(
  client: DbClient,
  memberId: number,
  selectionId: number
): Promise<boolean> {
  const { rowCount } = await query(
    client,
    `DELETE FROM circuit_queue_item WHERE member_id = $1 AND selection_id = $2`,
    [memberId, selectionId]
  );
  if ((rowCount ?? 0) === 0) return false;
  await query(
    client,
    `UPDATE circuit_queue_item AS q
     SET position = r.n
     FROM (
       SELECT selection_id, row_number() OVER (ORDER BY position)::int AS n
       FROM circuit_queue_item WHERE member_id = $1
     ) r
     WHERE q.member_id = $1 AND q.selection_id = r.selection_id AND q.position <> r.n`,
    [memberId]
  );
  return true;
}

/** Rewrites every position: the first id is position 1. */
export async function setCircuitQueueOrder(
  client: DbClient,
  memberId: number,
  selectionIdsInOrder: readonly number[]
): Promise<void> {
  await query(
    client,
    `UPDATE circuit_queue_item AS q
     SET position = o.n::int
     FROM unnest($2::bigint[]) WITH ORDINALITY AS o(selection_id, n)
     WHERE q.member_id = $1 AND q.selection_id = o.selection_id`,
    [memberId, selectionIdsInOrder]
  );
}

/*
 * Staged selections (migration 032): set aside to draft by hand, unranked and
 * never read by the auto-pick. Writes take lockCircuitQueue too, so a move
 * between the queue and staging is serialised with every other queue write.
 */

export async function listCircuitStaged(
  client: DbClient,
  memberId: number
): Promise<Array<{ selection_id: number }>> {
  const { rows } = await query<{ selection_id: number }>(
    client,
    `SELECT selection_id::int
     FROM circuit_staged_item
     WHERE member_id = $1
     ORDER BY created_at, selection_id`,
    [memberId]
  );
  return rows;
}

/** Stages a selection; false when it was already staged. */
export async function insertCircuitStagedItem(
  client: DbClient,
  memberId: number,
  selectionId: number
): Promise<boolean> {
  const { rowCount } = await query(
    client,
    `INSERT INTO circuit_staged_item (member_id, selection_id)
     VALUES ($1, $2)
     ON CONFLICT (member_id, selection_id) DO NOTHING`,
    [memberId, selectionId]
  );
  return (rowCount ?? 0) > 0;
}

/** Unstages a selection; false when it was not staged. */
export async function deleteCircuitStagedItem(
  client: DbClient,
  memberId: number,
  selectionId: number
): Promise<boolean> {
  const { rowCount } = await query(
    client,
    `DELETE FROM circuit_staged_item WHERE member_id = $1 AND selection_id = $2`,
    [memberId, selectionId]
  );
  return (rowCount ?? 0) > 0;
}
