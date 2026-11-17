import { getSnakeSeatForPick } from "@fantasy-oscars/shared";
import { AppError } from "../errors.js";
import { assertAcquisitionFits, type HeldSelection } from "./circuitOwnership.js";

/*
 * Circuit draft (ADR 0005, section 6). Pure: no IO.
 *
 * A live snake draft over the league's members. Seats are shuffled uniformly
 * (Fisher–Yates with an injectable random source), rounds equal the roster
 * size, and the seat on the clock comes from the shared getSnakeSeatForPick,
 * the same function the ceremony draft uses.
 *
 * Missed picks (owner question 1, recommended answer): after the last regular
 * pick, one supplemental round runs, made up only of the regular picks that
 * were missed, in original pick order and on the same clock. A supplemental
 * pick that is missed again becomes a chip; there is no second chance.
 */

export const circuitDraftStatuses = [
  "PENDING",
  "IN_PROGRESS",
  "PAUSED",
  "SUPPLEMENTAL",
  "COMPLETED",
  "CANCELLED"
] as const;
export type CircuitDraftStatus = (typeof circuitDraftStatuses)[number];

/** The pick clock when the league sets none: null and 0 are untimed. */
export function circuitDraftPickTimer(leagueTimerSeconds: number | null): number {
  return leagueTimerSeconds ?? 0;
}

/**
 * A uniformly random permutation of `items` (Fisher–Yates). `random` returns
 * a number in [0, 1), like Math.random; each of the n! orders is equally
 * likely when it is uniform.
 */
export function shuffleUniformly<T>(
  items: readonly T[],
  random: () => number = Math.random
): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** The number of picks in the regular rounds. */
export function regularPickCount(seatCount: number, rounds: number): number {
  return seatCount * rounds;
}

export type CircuitDraftTurn = {
  pick_number: number;
  round_number: number;
  seat_number: number;
};

/**
 * The regular-round seat on the clock at `pickNumber`; null when no pick is
 * on the clock, there are no seats, or the regular rounds are over.
 */
export function circuitDraftTurn(input: {
  seatCount: number;
  rounds: number;
  pickNumber: number | null;
}): CircuitDraftTurn | null {
  const { seatCount, rounds, pickNumber } = input;
  if (pickNumber === null || pickNumber < 1 || seatCount < 1) return null;
  if (pickNumber > regularPickCount(seatCount, rounds)) return null;
  return {
    pick_number: pickNumber,
    round_number: Math.ceil(pickNumber / seatCount),
    seat_number: getSnakeSeatForPick(seatCount, pickNumber)
  };
}

/** The league owner starts the draft once, on an initialised snake league. */
export function assertCircuitDraftStartable(
  league: { status: string; draft_type: string },
  memberCount: number
): void {
  if (league.status !== "INITIALIZED") {
    throw new AppError(
      "CIRCUIT_DRAFT_NOT_STARTABLE",
      409,
      league.status === "SETUP"
        ? "Start the season before the draft"
        : "This season's draft has already started",
      { status: league.status }
    );
  }
  if (league.draft_type !== "SNAKE") {
    throw new AppError(
      "CIRCUIT_DRAFT_TYPE_UNSUPPORTED",
      409,
      "Only snake drafts can run this season",
      { draft_type: league.draft_type }
    );
  }
  if (memberCount === 0) {
    throw new AppError(
      "CIRCUIT_LEAGUE_EMPTY",
      409,
      "Someone has to join before the draft can start"
    );
  }
}

/** The statuses in which a pick is on the clock. */
export function isCircuitDraftRunning(status: string): boolean {
  return status === "IN_PROGRESS" || status === "SUPPLEMENTAL";
}

/** Picks are taken only while the draft runs. */
export function assertCircuitDraftTakingPicks(draft: { status: string }): void {
  if (draft.status === "PAUSED") {
    throw new AppError("CIRCUIT_DRAFT_PAUSED", 409, "The draft is paused");
  }
  if (!isCircuitDraftRunning(draft.status)) {
    throw new AppError("CIRCUIT_DRAFT_NOT_IN_PROGRESS", 409, "The draft isn't running", {
      status: draft.status
    });
  }
}

/** Refuses a pick from anyone but the member on the clock. */
export function assertOnTheClock(onTheClockMemberId: number, memberId: number): void {
  if (onTheClockMemberId !== memberId) {
    throw new AppError("CIRCUIT_DRAFT_NOT_YOUR_TURN", 409, "It isn't your pick yet");
  }
}

/** A regular pick that was missed, in the supplemental round's order. */
export type MissedRegularPick = {
  original_pick_number: number;
  seat_number: number;
};

export type CircuitDraftSlot = {
  pick_number: number;
  original_pick_number: number;
  seat_number: number;
  supplemental: boolean;
};

/**
 * The slot on the clock at `pickNumber`: a regular pick, or a supplemental
 * pick for the k-th missed regular pick (`missed` in original pick order).
 * Null when no pick is on the clock or the draft has run out of picks.
 */
export function circuitDraftSlot(input: {
  seatCount: number;
  rounds: number;
  pickNumber: number | null;
  missed: readonly MissedRegularPick[];
}): CircuitDraftSlot | null {
  const { seatCount, rounds, pickNumber, missed } = input;
  const turn = circuitDraftTurn({ seatCount, rounds, pickNumber });
  if (turn) {
    return {
      pick_number: turn.pick_number,
      original_pick_number: turn.pick_number,
      seat_number: turn.seat_number,
      supplemental: false
    };
  }
  if (pickNumber === null || seatCount < 1) return null;
  const owed = missed[pickNumber - regularPickCount(seatCount, rounds) - 1];
  if (!owed) return null;
  return {
    pick_number: pickNumber,
    original_pick_number: owed.original_pick_number,
    seat_number: owed.seat_number,
    supplemental: true
  };
}

/**
 * Where the draft goes after the pick at `pickNumber` resolves: the next pick
 * and the status it runs under, or null when the draft is complete.
 * `missedCount` counts the missed regular picks, including this one.
 */
export function nextCircuitDraftPick(input: {
  seatCount: number;
  rounds: number;
  pickNumber: number;
  missedCount: number;
}): { pick_number: number; status: "IN_PROGRESS" | "SUPPLEMENTAL" } | null {
  const regular = regularPickCount(input.seatCount, input.rounds);
  const next = input.pickNumber + 1;
  if (next > regular + input.missedCount) return null;
  return { pick_number: next, status: next > regular ? "SUPPLEMENTAL" : "IN_PROGRESS" };
}

/** True when the clock has run out on a timed, running draft. */
export function isCircuitDraftPickDue(
  draft: { status: string; pick_timer_seconds: number; pick_deadline_at: Date | null },
  now: Date
): boolean {
  return (
    isCircuitDraftRunning(draft.status) &&
    draft.pick_timer_seconds > 0 &&
    draft.pick_deadline_at !== null &&
    draft.pick_deadline_at.getTime() <= now.getTime()
  );
}

export type QueuedSelection = { selection_id: number; category_id: number };

/**
 * The auto-pick: the first queued selection, in queue order, that is not
 * `unavailable` (owned in the league or drafted in this draft) and fits the
 * member's roster and category limits. Null means the pick is MISSED. It
 * never looks outside the queue.
 */
export function chooseCircuitAutoPick(input: {
  queue: readonly QueuedSelection[];
  unavailable: ReadonlySet<number>;
  held: readonly HeldSelection[];
  rosterSize: number;
  maxOwnedByCategory: ReadonlyMap<number, number | null>;
}): number | null {
  for (const item of input.queue) {
    if (input.unavailable.has(item.selection_id)) continue;
    if (input.held.some((h) => h.selection_id === item.selection_id)) continue;
    try {
      assertAcquisitionFits({
        held: input.held,
        add: item,
        dropSelectionId: null,
        rosterSize: input.rosterSize,
        maxOwned: input.maxOwnedByCategory.get(item.category_id) ?? null
      });
    } catch (err) {
      if (err instanceof AppError) continue;
      throw err;
    }
    return item.selection_id;
  }
  return null;
}

/** Pausing applies to a running draft only. */
export function assertCircuitDraftPausable(draft: { status: string }): void {
  if (draft.status === "PAUSED") {
    throw new AppError("CIRCUIT_DRAFT_PAUSED", 409, "The draft is already paused");
  }
  if (!isCircuitDraftRunning(draft.status)) {
    throw new AppError("CIRCUIT_DRAFT_NOT_IN_PROGRESS", 409, "The draft isn't running", {
      status: draft.status
    });
  }
}

export function assertCircuitDraftResumable(draft: { status: string }): void {
  if (draft.status !== "PAUSED") {
    throw new AppError("CIRCUIT_DRAFT_NOT_PAUSED", 409, "The draft isn't paused", {
      status: draft.status
    });
  }
}

/** The status a paused draft resumes in: supplemental once the regular rounds are over. */
export function resumedCircuitDraftStatus(input: {
  seatCount: number;
  rounds: number;
  pickNumber: number;
}): "IN_PROGRESS" | "SUPPLEMENTAL" {
  return input.pickNumber > regularPickCount(input.seatCount, input.rounds)
    ? "SUPPLEMENTAL"
    : "IN_PROGRESS";
}

/**
 * The deadline after a resume: the time that was left when the draft paused,
 * or a full clock when none was left. Null when untimed.
 */
export function resumedCircuitDraftDeadline(input: {
  pickTimerSeconds: number;
  pickDeadlineAt: Date | null;
  pausedAt: Date | null;
  now: Date;
}): Date | null {
  if (input.pickTimerSeconds <= 0) return null;
  const full = input.pickTimerSeconds * 1000;
  const left =
    input.pickDeadlineAt && input.pausedAt
      ? input.pickDeadlineAt.getTime() - input.pausedAt.getTime()
      : 0;
  return new Date(input.now.getTime() + (left > 0 ? Math.min(left, full) : full));
}
