import { AppError } from "../errors.js";

/*
 * Circuit ownership (ADR 0005, section 7). Pure: no IO.
 *
 * Ownership is a set of half-open intervals [acquired_at, released_at). An
 * interval is open at `t` when acquired_at <= t and it was not released by
 * `t`, so at a boundary instant the new owner holds the selection and the old
 * one does not. Scoring asks for the owner at an occasion's instant
 * (instantOfDay in circuit.ts).
 */

export const circuitTransactionKinds = [
  "DRAFT",
  "SUPPLEMENTAL",
  "WAIVER",
  "FREE_AGENT",
  "DROP"
] as const;
export type CircuitTransactionKind = (typeof circuitTransactionKinds)[number];

export type OwnershipInterval = {
  member_id: number;
  selection_id: number;
  acquired_at: Date;
  released_at: Date | null;
};

/** True when the interval holds its selection at `t`. */
export function isHeldAt(interval: OwnershipInterval, t: Date): boolean {
  const at = t.getTime();
  return (
    interval.acquired_at.getTime() <= at &&
    (interval.released_at === null || interval.released_at.getTime() > at)
  );
}

/** The member who owned the selection at `t`, or null. */
export function ownerAt(
  intervals: readonly OwnershipInterval[],
  selectionId: number,
  t: Date
): number | null {
  const held = intervals.find((i) => i.selection_id === selectionId && isHeldAt(i, t));
  return held ? held.member_id : null;
}

/** Intervals not yet released. */
export function openIntervals<T extends OwnershipInterval>(intervals: readonly T[]): T[] {
  return intervals.filter((i) => i.released_at === null);
}

/** Open intervals grouped by member. */
export function openIntervalsByMember<T extends OwnershipInterval>(
  intervals: readonly T[]
): Map<number, T[]> {
  const byMember = new Map<number, T[]>();
  for (const interval of openIntervals(intervals)) {
    const list = byMember.get(interval.member_id) ?? [];
    list.push(interval);
    byMember.set(interval.member_id, list);
  }
  return byMember;
}

/** One member's open intervals counted per category. */
export function openCountByCategory(
  intervals: ReadonlyArray<OwnershipInterval & { category_id: number }>,
  memberId: number
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const interval of openIntervals(intervals)) {
    if (interval.member_id !== memberId) continue;
    counts.set(interval.category_id, (counts.get(interval.category_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Checks the transaction row's shape before it is written (the table's checks
 * say the same): a DROP has no add and every other kind adds; draft kinds
 * carry a pick and no drop; a waiver carries a claim.
 */
export function assertTransactionShape(input: {
  kind: CircuitTransactionKind;
  addSelectionId: number | null;
  dropSelectionId: number | null;
  draftPickId: number | null;
  claimId: number | null;
}): void {
  const { kind, addSelectionId, dropSelectionId, draftPickId, claimId } = input;
  const isDraft = kind === "DRAFT" || kind === "SUPPLEMENTAL";
  const ok =
    (kind === "DROP") === (addSelectionId === null) &&
    (addSelectionId !== null || dropSelectionId !== null) &&
    addSelectionId !== dropSelectionId &&
    isDraft === (draftPickId !== null) &&
    (!isDraft || dropSelectionId === null) &&
    (kind === "WAIVER") === (claimId !== null);
  if (!ok) throw new Error(`Malformed ${kind} transaction`);
}

export type HeldSelection = { selection_id: number; category_id: number };

/**
 * Refuses an add the member's roster cannot take. `held` is the member's open
 * ownership, read under the member-row lock. The drop, if any, leaves before
 * the add arrives, so the roster is never over capacity, even inside the
 * transaction. Null `maxOwned` is unlimited.
 */
export function assertAcquisitionFits(input: {
  held: readonly HeldSelection[];
  add: HeldSelection;
  dropSelectionId: number | null;
  rosterSize: number;
  maxOwned: number | null;
}): void {
  const remaining = input.held.filter((h) => h.selection_id !== input.dropSelectionId);
  if (remaining.length + 1 > input.rosterSize) {
    throw new AppError(
      "CIRCUIT_ROSTER_FULL",
      409,
      "Your roster is full. Choose a contender to drop.",
      { roster_size: input.rosterSize }
    );
  }
  const inCategory = remaining.filter(
    (h) => h.category_id === input.add.category_id
  ).length;
  if (input.maxOwned !== null && inCategory + 1 > input.maxOwned) {
    throw new AppError(
      "CIRCUIT_CATEGORY_FULL",
      409,
      `You already have the most contenders allowed in this category (${input.maxOwned}). Drop one of them first.`,
      { circuit_category_id: input.add.category_id, max_owned: input.maxOwned }
    );
  }
}

/** Refuses a drop of a selection the member does not hold. */
export function assertHolds(held: readonly HeldSelection[], selectionId: number): void {
  if (!held.some((h) => h.selection_id === selectionId)) {
    throw new AppError(
      "CIRCUIT_SELECTION_NOT_OWNED",
      409,
      "That contender isn't on your roster"
    );
  }
}

/** Adds and drops happen after the draft, until the season ends. */
export function assertCircuitLeagueInSeason(league: { status: string }): void {
  if (league.status !== "IN_SEASON") {
    throw new AppError(
      "CIRCUIT_LEAGUE_NOT_IN_SEASON",
      409,
      league.status === "COMPLETE"
        ? "This season has finished"
        : "Adds and drops open after the draft",
      { status: league.status }
    );
  }
}
