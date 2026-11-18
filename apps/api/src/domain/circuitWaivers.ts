/*
 * Waiver claims, priority and chips (ADR 0005, section 9). Pure: no IO.
 */

import { AppError } from "../errors.js";
import { instantOfDay } from "./circuit.js";
import { assertAcquisitionFits, type HeldSelection } from "./circuitOwnership.js";
import { addDays, type WaiverWindow } from "./waiverWindows.js";

export type WaiverPriority = { member_id: number; waiver_priority: number };

/**
 * Rolling priority at the end of the draft: reverse draft order, so the last
 * seat gets 1 (first) and seat 1 gets the bottom.
 */
export function initialWaiverPriorities(
  seats: ReadonlyArray<{ seat_number: number; member_id: number }>
): WaiverPriority[] {
  return [...seats]
    .sort((a, b) => b.seat_number - a.seat_number)
    .map((seat, i) => ({ member_id: seat.member_id, waiver_priority: i + 1 }));
}

/**
 * The window a claim write goes to, or an error. Claims change only while
 * their window is open and before the processor has locked it. A new claim
 * passes a null `claimWindowStartsOn` and goes to the window open now.
 */
export function editableClaimWindow(input: {
  openWindow: WaiverWindow | null;
  claimWindowStartsOn: string | null;
  runStarted: boolean;
}): WaiverWindow {
  const { openWindow, claimWindowStartsOn, runStarted } = input;
  if (claimWindowStartsOn === null && !openWindow) {
    throw new AppError(
      "CIRCUIT_WAIVER_WINDOW_CLOSED",
      409,
      "Waiver claims open with the next waiver window"
    );
  }
  if (
    runStarted ||
    !openWindow ||
    (claimWindowStartsOn !== null && claimWindowStartsOn !== openWindow.starts_on)
  ) {
    throw new AppError(
      "CIRCUIT_WAIVER_CLAIMS_LOCKED",
      409,
      "Claims for this waiver window can no longer change"
    );
  }
  return openWindow;
}

export type WaiverFailureReason =
  "SELECTION_OWNED" | "DROP_NOT_OWNED" | "ROSTER_FULL" | "CATEGORY_LIMIT";

export type OrderableClaim = {
  id: number;
  member_id: number;
  rank: number;
  /** The attached chip's value while the chip is available; null without one. */
  chip_pick_number: number | null;
};

/**
 * The order a run evaluates its claims in: chipped claims by their chip's
 * original pick number, then unchipped claims by the member's rolling
 * priority, then by the member's own rank. Priority is the one at the start
 * of the run; a member without one goes last.
 */
export function orderWaiverClaims<T extends OrderableClaim>(
  claims: readonly T[],
  priorities: readonly WaiverPriority[]
): T[] {
  const priorityOf = new Map(priorities.map((p) => [p.member_id, p.waiver_priority]));
  const priority = (c: T) => priorityOf.get(c.member_id) ?? Number.MAX_SAFE_INTEGER;
  const chipped = claims
    .filter((c) => c.chip_pick_number !== null)
    .sort((a, b) => a.chip_pick_number! - b.chip_pick_number!);
  const unchipped = claims
    .filter((c) => c.chip_pick_number === null)
    .sort((a, b) => priority(a) - priority(b) || a.rank - b.rank || a.id - b.id);
  return [...chipped, ...unchipped];
}

/**
 * Why a claim fails against the state left by the claims before it, or null
 * when it wins. `held` is the claimant's open ownership and `selectionOwner`
 * the member holding the claimed selection now. Capacity follows
 * assertAcquisitionFits, the rule every other acquisition uses.
 */
export function waiverClaimFailure(input: {
  selectionOwner: number | null;
  held: readonly HeldSelection[];
  add: HeldSelection;
  dropSelectionId: number | null;
  rosterSize: number;
  maxOwned: number | null;
}): WaiverFailureReason | null {
  if (input.selectionOwner !== null) return "SELECTION_OWNED";
  if (
    input.dropSelectionId !== null &&
    !input.held.some((h) => h.selection_id === input.dropSelectionId)
  ) {
    return "DROP_NOT_OWNED";
  }
  try {
    assertAcquisitionFits(input);
  } catch (err) {
    if (err instanceof AppError && err.code === "CIRCUIT_ROSTER_FULL") {
      return "ROSTER_FULL";
    }
    if (err instanceof AppError && err.code === "CIRCUIT_CATEGORY_FULL") {
      return "CATEGORY_LIMIT";
    }
    throw err;
  }
  return null;
}

/**
 * Rolling priority after a run: every member who won at least one claim moves
 * to the bottom once, and both groups keep their relative order. Failures
 * change nothing.
 */
export function rotateWaiverPriorities(
  priorities: readonly WaiverPriority[],
  winners: ReadonlySet<number>
): WaiverPriority[] {
  const ordered = [...priorities].sort((a, b) => a.waiver_priority - b.waiver_priority);
  return [
    ...ordered.filter((p) => !winners.has(p.member_id)),
    ...ordered.filter((p) => winners.has(p.member_id))
  ].map((p, i) => ({ member_id: p.member_id, waiver_priority: i + 1 }));
}

/** A window the processor runs: claims keyed to `starts_on`. */
export type DueWaiverWindow = { starts_on: string; ends_on: string; resolves_on: string };

/**
 * The windows of a league whose resolution instant has passed and that have
 * no run yet, oldest first. Only windows the league could claim in count:
 * those resolving after its draft completed. A missed check finds the same
 * windows on the next one, so downtime delays a run but never skips it.
 *
 * Claims keep the window they were filed in (question 5). Pending claims
 * keyed to a day that no longer starts a window resolve with the window
 * that now covers that day or, when none does, three days after it, the
 * resolution of the shortest window.
 */
export function dueWaiverWindows(input: {
  windows: readonly WaiverWindow[];
  draftCompletedAt: Date;
  runStarts: ReadonlySet<string>;
  pendingClaimStarts: Iterable<string>;
  now: Date;
}): DueWaiverWindow[] {
  const { windows, draftCompletedAt, runStarts, now } = input;
  const passed = (day: string) => instantOfDay(day).getTime() <= now.getTime();
  const due = new Map<string, DueWaiverWindow>();
  for (const w of windows) {
    if (
      passed(w.resolves_on) &&
      instantOfDay(w.resolves_on).getTime() > draftCompletedAt.getTime()
    ) {
      due.set(w.starts_on, {
        starts_on: w.starts_on,
        ends_on: w.ends_on,
        resolves_on: w.resolves_on
      });
    }
  }
  const starts = new Set(windows.map((w) => w.starts_on));
  for (const key of input.pendingClaimStarts) {
    if (starts.has(key) || due.has(key)) continue;
    const covering = windows.find((w) => w.starts_on <= key && key <= w.ends_on);
    const ends_on = covering ? covering.ends_on : addDays(key, 2);
    const resolves_on = addDays(ends_on, 1);
    if (passed(resolves_on)) due.set(key, { starts_on: key, ends_on, resolves_on });
  }
  return [...due.values()]
    .filter((w) => !runStarts.has(w.starts_on))
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
}

/**
 * Whether a run expires the league's available chips (question 12): the
 * league's first window is the first to open after its draft completed, so
 * a window already open at completion does not count. Chips are made only by
 * the draft, so expiring at every later run expires them at the first.
 */
export function waiverRunExpiresChips(
  windowStartsOn: string,
  draftCompletedAt: Date
): boolean {
  return instantOfDay(windowStartsOn).getTime() >= draftCompletedAt.getTime();
}
