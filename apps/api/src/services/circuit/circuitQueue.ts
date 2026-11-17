import type { Pool } from "pg";
import { type DbClient, runInTransaction } from "../../data/db.js";
import type { CircuitLeagueRow } from "../../data/repositories/circuitLeagueRepository.js";
import {
  getCircuitLeagueMemberByUser,
  getSelectionPlacement,
  type CircuitMemberRow
} from "../../data/repositories/circuitOwnershipRepository.js";
import {
  appendCircuitQueueItem,
  deleteCircuitQueueItem,
  listCircuitQueue,
  lockCircuitQueue,
  setCircuitQueueOrder
} from "../../data/repositories/circuitQueueRepository.js";
import { listCircuitSelectionsByIds } from "../../data/repositories/circuitSelectionRepository.js";
import { AppError } from "../../errors.js";
import { requireVisibleCircuitLeague, type Viewer } from "./circuitLeagues.js";
import { toPublicCircuitSelection } from "./circuitSelections.js";

/*
 * The draft queue (ADR 0005, section 6): each member's ordered list of
 * selections, private to that member. It is the crib sheet and the only
 * source of an auto-pick, editable at any time, before and during the draft.
 * A queued selection that someone drafts stays queued; the auto-pick skips it.
 * Every write takes the queue lock first, so writes to one queue are
 * serialised; an auto-pick reads the queue in one statement.
 */

async function requireQueueOwner(
  client: DbClient,
  circuitLeagueId: number,
  viewer: Viewer
): Promise<{ circuitLeague: CircuitLeagueRow; member: CircuitMemberRow }> {
  const { circuitLeague } = await requireVisibleCircuitLeague(
    client,
    circuitLeagueId,
    viewer
  );
  const member = await getCircuitLeagueMemberByUser(
    client,
    circuitLeague.id,
    viewer.userId
  );
  if (!member) {
    throw new AppError(
      "CIRCUIT_MEMBERSHIP_REQUIRED",
      403,
      "Join this season to keep a draft queue"
    );
  }
  return { circuitLeague, member };
}

async function lockQueueOwner(tx: DbClient, circuitLeagueId: number, viewer: Viewer) {
  const found = await requireQueueOwner(tx, circuitLeagueId, viewer);
  await lockCircuitQueue(tx, found.member.id);
  return found;
}

async function queueOf(client: DbClient, member: CircuitMemberRow) {
  const items = await listCircuitQueue(client, member.id);
  const selections = new Map(
    (
      await listCircuitSelectionsByIds(
        client,
        items.map((i) => i.selection_id)
      )
    ).map((s) => [s.id, toPublicCircuitSelection(s)])
  );
  return {
    items: items.map((i) => ({
      position: i.position,
      selection: selections.get(i.selection_id)!
    }))
  };
}

/** The viewer's queue, top first. */
export async function getCircuitQueue(
  client: DbClient,
  circuitLeagueId: number,
  viewer: Viewer
) {
  const { member } = await requireQueueOwner(client, circuitLeagueId, viewer);
  return queueOf(client, member);
}

/**
 * Adds a selection of the league's Circuit at the bottom of the viewer's
 * queue. Owned and drafted selections may be queued. `added` is false when
 * it was already queued, which leaves the queue as it was.
 */
export async function addToCircuitQueue(
  pool: Pool,
  circuitLeagueId: number,
  viewer: Viewer,
  selectionId: number
) {
  return runInTransaction(pool, async (tx) => {
    const { circuitLeague, member } = await lockQueueOwner(tx, circuitLeagueId, viewer);
    const selection = await getSelectionPlacement(tx, selectionId);
    if (!selection || selection.circuit_id !== circuitLeague.circuit_id) {
      throw new AppError("NOT_FOUND", 404, "That contender isn't in this season");
    }
    const added = await appendCircuitQueueItem(tx, member.id, selection.id);
    return { added, ...(await queueOf(tx, member)) };
  });
}

/** Removes a selection from the viewer's queue. */
export async function removeFromCircuitQueue(
  pool: Pool,
  circuitLeagueId: number,
  viewer: Viewer,
  selectionId: number
) {
  return runInTransaction(pool, async (tx) => {
    const { member } = await lockQueueOwner(tx, circuitLeagueId, viewer);
    if (!(await deleteCircuitQueueItem(tx, member.id, selectionId))) {
      throw new AppError("NOT_FOUND", 404, "That contender isn't in your queue");
    }
    return queueOf(tx, member);
  });
}

/**
 * Reorders the viewer's queue. `selectionIds` must list exactly the queued
 * selections, so an edit made elsewhere in the meantime is never lost.
 */
export async function reorderCircuitQueue(
  pool: Pool,
  circuitLeagueId: number,
  viewer: Viewer,
  selectionIds: readonly number[]
) {
  return runInTransaction(pool, async (tx) => {
    const { member } = await lockQueueOwner(tx, circuitLeagueId, viewer);
    const current = new Set(
      (await listCircuitQueue(tx, member.id)).map((i) => i.selection_id)
    );
    const sameSet =
      selectionIds.length === current.size &&
      new Set(selectionIds).size === selectionIds.length &&
      selectionIds.every((id) => current.has(id));
    if (!sameSet) {
      throw new AppError(
        "CIRCUIT_QUEUE_CHANGED",
        409,
        "Your queue changed. Reload it and try again."
      );
    }
    await setCircuitQueueOrder(tx, member.id, selectionIds);
    return queueOf(tx, member);
  });
}
