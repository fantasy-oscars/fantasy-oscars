import { type DbClient, query } from "../db.js";
import type { CircuitTransactionKind } from "../../domain/circuitOwnership.js";

/*
 * Circuit ownership intervals and transactions (ADR 0005, section 7).
 * Append-only: the writes here insert rows or close an open interval, and
 * only services/circuit/circuitOwnership.ts calls them.
 */

export type CircuitMemberRow = { id: number; user_id: number; username: string };

export type OpenOwnershipRow = {
  id: number;
  member_id: number;
  selection_id: number;
  category_id: number;
  acquired_at: Date;
  acquired_transaction_id: number;
};

export type CircuitOwnershipRow = {
  id: number;
  circuit_league_id: number;
  member_id: number;
  selection_id: number;
  acquired_at: Date;
  acquired_transaction_id: number;
  released_at: Date | null;
  released_transaction_id: number | null;
};

export type CircuitTransactionRow = {
  id: number;
  circuit_league_id: number;
  member_id: number;
  kind: CircuitTransactionKind;
  add_selection_id: number | null;
  drop_selection_id: number | null;
  draft_pick_id: number | null;
  claim_id: number | null;
  occurred_at: Date;
  actor_user_id: number | null;
};

export type CircuitTransactionLogRow = CircuitTransactionRow & {
  user_id: number;
  username: string;
};

const TRANSACTION_COLUMNS = `
  t.id::int,
  t.circuit_league_id::int,
  t.member_id::int,
  t.kind,
  t.add_selection_id::int,
  t.drop_selection_id::int,
  t.draft_pick_id::int,
  t.claim_id::int,
  t.occurred_at,
  t.actor_user_id::int`;

const MEMBER_COLUMNS = `m.id::int, m.user_id::int, u.username`;

/** Locks the member row for the rest of the transaction. */
export async function lockCircuitLeagueMember(
  client: DbClient,
  circuitLeagueId: number,
  memberId: number
): Promise<CircuitMemberRow | null> {
  const { rows } = await query<CircuitMemberRow>(
    client,
    `SELECT ${MEMBER_COLUMNS}
     FROM circuit_league_member m
     JOIN app_user u ON u.id = m.user_id
     WHERE m.circuit_league_id = $1 AND m.id = $2
     FOR UPDATE OF m`,
    [circuitLeagueId, memberId]
  );
  return rows[0] ?? null;
}

export async function getCircuitLeagueMemberByUser(
  client: DbClient,
  circuitLeagueId: number,
  userId: number
): Promise<CircuitMemberRow | null> {
  const { rows } = await query<CircuitMemberRow>(
    client,
    `SELECT ${MEMBER_COLUMNS}
     FROM circuit_league_member m
     JOIN app_user u ON u.id = m.user_id
     WHERE m.circuit_league_id = $1 AND m.user_id = $2`,
    [circuitLeagueId, userId]
  );
  return rows[0] ?? null;
}

/** A member's open intervals with each selection's category, oldest first. */
export async function listOpenOwnershipsForMember(
  client: DbClient,
  circuitLeagueId: number,
  memberId: number
): Promise<OpenOwnershipRow[]> {
  const { rows } = await query<OpenOwnershipRow>(
    client,
    `SELECT o.id::int, o.member_id::int, o.selection_id::int,
            s.circuit_category_id::int AS category_id,
            o.acquired_at, o.acquired_transaction_id::int
     FROM circuit_ownership o
     JOIN circuit_selection s ON s.id = o.selection_id
     WHERE o.circuit_league_id = $1 AND o.member_id = $2 AND o.released_at IS NULL
     ORDER BY o.acquired_at, o.id`,
    [circuitLeagueId, memberId]
  );
  return rows;
}

/** Every member's open intervals in a league, by member and then oldest first. */
export async function listOpenOwnershipsForLeague(
  client: DbClient,
  circuitLeagueId: number
): Promise<OpenOwnershipRow[]> {
  const { rows } = await query<OpenOwnershipRow>(
    client,
    `SELECT o.id::int, o.member_id::int, o.selection_id::int,
            s.circuit_category_id::int AS category_id,
            o.acquired_at, o.acquired_transaction_id::int
     FROM circuit_ownership o
     JOIN circuit_selection s ON s.id = o.selection_id
     WHERE o.circuit_league_id = $1 AND o.released_at IS NULL
     ORDER BY o.member_id, o.acquired_at, o.id`,
    [circuitLeagueId]
  );
  return rows;
}

/** The user who holds a selection in a league now, if anyone does. */
export async function findSelectionOwner(
  client: DbClient,
  circuitLeagueId: number,
  selectionId: number
): Promise<{ user_id: number; username: string } | null> {
  const { rows } = await query<{ user_id: number; username: string }>(
    client,
    `SELECT m.user_id::int, u.username
     FROM circuit_ownership o
     JOIN circuit_league_member m ON m.id = o.member_id
     JOIN app_user u ON u.id = m.user_id
     WHERE o.circuit_league_id = $1 AND o.selection_id = $2 AND o.released_at IS NULL`,
    [circuitLeagueId, selectionId]
  );
  return rows[0] ?? null;
}

/** The open interval for a selection in a league, if anyone holds it. */
export async function findOpenOwnershipOfSelection(
  client: DbClient,
  circuitLeagueId: number,
  selectionId: number
): Promise<{ id: number; member_id: number } | null> {
  const { rows } = await query<{ id: number; member_id: number }>(
    client,
    `SELECT id::int, member_id::int
     FROM circuit_ownership
     WHERE circuit_league_id = $1 AND selection_id = $2 AND released_at IS NULL`,
    [circuitLeagueId, selectionId]
  );
  return rows[0] ?? null;
}

/** A selection's category and Circuit. */
export async function getSelectionPlacement(
  client: DbClient,
  selectionId: number
): Promise<{ id: number; category_id: number; circuit_id: number } | null> {
  const { rows } = await query<{ id: number; category_id: number; circuit_id: number }>(
    client,
    `SELECT s.id::int, s.circuit_category_id::int AS category_id, cc.circuit_id::int
     FROM circuit_selection s
     JOIN circuit_category cc ON cc.id = s.circuit_category_id
     WHERE s.id = $1`,
    [selectionId]
  );
  return rows[0] ?? null;
}

/** The league's limit for a category; null (no row, or no limit) is unlimited. */
export async function getCategoryMaxOwned(
  client: DbClient,
  circuitLeagueId: number,
  categoryId: number
): Promise<number | null> {
  const { rows } = await query<{ max_owned: number | null }>(
    client,
    `SELECT max_owned
     FROM circuit_league_category
     WHERE circuit_league_id = $1 AND circuit_category_id = $2`,
    [circuitLeagueId, categoryId]
  );
  return rows[0]?.max_owned ?? null;
}

export async function insertCircuitTransaction(
  client: DbClient,
  input: {
    circuit_league_id: number;
    member_id: number;
    kind: CircuitTransactionKind;
    add_selection_id: number | null;
    drop_selection_id: number | null;
    draft_pick_id: number | null;
    claim_id: number | null;
    actor_user_id: number | null;
  }
): Promise<CircuitTransactionRow> {
  const { rows } = await query<CircuitTransactionRow>(
    client,
    `INSERT INTO circuit_transaction AS t
       (circuit_league_id, member_id, kind, add_selection_id, drop_selection_id,
        draft_pick_id, claim_id, actor_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${TRANSACTION_COLUMNS}`,
    [
      input.circuit_league_id,
      input.member_id,
      input.kind,
      input.add_selection_id,
      input.drop_selection_id,
      input.draft_pick_id,
      input.claim_id,
      input.actor_user_id
    ]
  );
  return rows[0]!;
}

// Boundaries take the transaction row's occurred_at in SQL: a JavaScript Date
// would drop its microseconds.

/** Closes an open interval at the transaction's instant. */
export async function closeCircuitOwnership(
  client: DbClient,
  ownershipId: number,
  transaction: { id: number }
): Promise<void> {
  await query(
    client,
    `UPDATE circuit_ownership o
     SET released_at = t.occurred_at, released_transaction_id = t.id
     FROM circuit_transaction t
     WHERE o.id = $1 AND o.released_at IS NULL AND t.id = $2`,
    [ownershipId, transaction.id]
  );
}

/** Opens an interval at the transaction's instant. */
export async function insertCircuitOwnership(
  client: DbClient,
  transaction: { id: number },
  selectionId: number
): Promise<void> {
  await query(
    client,
    `INSERT INTO circuit_ownership
       (circuit_league_id, member_id, selection_id, acquired_at, acquired_transaction_id)
     SELECT t.circuit_league_id, t.member_id, $2, t.occurred_at, t.id
     FROM circuit_transaction t
     WHERE t.id = $1`,
    [transaction.id, selectionId]
  );
}

/** Every interval of a league, open and closed, oldest first. */
export async function listCircuitOwnershipHistory(
  client: DbClient,
  circuitLeagueId: number
): Promise<CircuitOwnershipRow[]> {
  const { rows } = await query<CircuitOwnershipRow>(
    client,
    `SELECT id::int, circuit_league_id::int, member_id::int, selection_id::int,
            acquired_at, acquired_transaction_id::int,
            released_at, released_transaction_id::int
     FROM circuit_ownership
     WHERE circuit_league_id = $1
     ORDER BY acquired_at, id`,
    [circuitLeagueId]
  );
  return rows;
}

/** The league's transactions, newest first, with the member's user. */
export async function listCircuitTransactions(
  client: DbClient,
  circuitLeagueId: number
): Promise<CircuitTransactionLogRow[]> {
  const { rows } = await query<CircuitTransactionLogRow>(
    client,
    `SELECT ${TRANSACTION_COLUMNS}, m.user_id::int, u.username
     FROM circuit_transaction t
     JOIN circuit_league_member m ON m.id = t.member_id
     JOIN app_user u ON u.id = m.user_id
     WHERE t.circuit_league_id = $1
     ORDER BY t.occurred_at DESC, t.id DESC`,
    [circuitLeagueId]
  );
  return rows;
}
