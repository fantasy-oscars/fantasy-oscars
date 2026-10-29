import type { Snapshot } from "../../lib/types";

/** A pick the user has submitted but the server has not yet echoed back. */
export type PendingPick = {
  requestId: string;
  nominationId: number;
  seatNumber: number;
  pickNumber: number;
};

/**
 * True once the snapshot already holds this pick (via socket event or refetch), or
 * the draft moved on without it (e.g. the timer auto-picked first). Either way the
 * optimistic overlay has nothing left to say.
 */
export function isPendingPickSettled(
  snapshot: Snapshot | null,
  pending: PendingPick
): boolean {
  if (!snapshot) return true;
  if (snapshot.picks.some((p) => p.nomination_id === pending.nominationId)) return true;
  if (snapshot.picks.some((p) => p.pick_number === pending.pickNumber)) return true;
  return snapshot.draft.current_pick_number !== pending.pickNumber;
}

/**
 * Snapshot as it will look once the pending pick lands. Pure overlay: the real
 * snapshot is never touched, so the socket event for the same pick cannot double-apply.
 */
export function applyPendingPick(
  snapshot: Snapshot | null,
  pending: PendingPick | null
): Snapshot | null {
  if (!snapshot || !pending) return snapshot;
  if (isPendingPickSettled(snapshot, pending)) return snapshot;
  return {
    ...snapshot,
    picks: [
      ...snapshot.picks,
      {
        pick_number: pending.pickNumber,
        seat_number: pending.seatNumber,
        nomination_id: pending.nominationId
      }
    ]
  };
}
