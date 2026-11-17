/*
 * Waiver windows (ADR 0005 section 9, ADR 0007). Pure: no IO.
 *
 * Windows are derived from scoring days, never stored. A scoring day is a
 * whole day, `YYYY-MM-DD`, on which at least one enabled occasion falls. Pass
 * a league's enabled occasions for its windows, or every occasion of a
 * Circuit for the windows it would have with every ceremony enabled.
 */

export type WaiverWindow = {
  /** First covered day, `YYYY-MM-DD`: the scoring day that opens the window. */
  starts_on: string;
  /** Last covered day, `YYYY-MM-DD`. */
  ends_on: string;
  /** The window resolves at 00:00 America/Los_Angeles on this day (`ends_on` + 1). */
  resolves_on: string;
  /** The scoring days that opened or extended the window, in order. */
  scoring_days: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toDayNumber(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!) / DAY_MS;
}

function fromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The waiver windows for a set of scoring days (any order, repeats allowed).
 *
 * - Consecutive scoring days form a block `[D, L]`; the block opens a window
 *   covering `D` through `max(D + 2, L + 1)`.
 * - A block that starts inside an open window extends it to the later of its
 *   current end and the block's own end, so windows never overlap.
 * - The window resolves at 00:00 America/Los_Angeles after its last day.
 * - The final scoring day opens and extends no window: there is no window
 *   after the final occasion.
 */
export function waiverWindows(scoringDays: Iterable<string>): WaiverWindow[] {
  const days = [...new Set(scoringDays)].map(toDayNumber).sort((a, b) => a - b);
  days.pop();

  const blocks: Array<{ start: number; days: number[] }> = [];
  for (const day of days) {
    const last = blocks[blocks.length - 1];
    if (last && day === last.days[last.days.length - 1]! + 1) {
      last.days.push(day);
    } else {
      blocks.push({ start: day, days: [day] });
    }
  }

  const windows: Array<{ start: number; end: number; days: number[] }> = [];
  for (const block of blocks) {
    const blockEnd = Math.max(block.start + 2, block.days[block.days.length - 1]! + 1);
    const open = windows[windows.length - 1];
    if (open && block.start <= open.end) {
      open.end = Math.max(open.end, blockEnd);
      open.days.push(...block.days);
    } else {
      windows.push({ start: block.start, end: blockEnd, days: [...block.days] });
    }
  }

  return windows.map((w) => ({
    starts_on: fromDayNumber(w.start),
    ends_on: fromDayNumber(w.end),
    resolves_on: fromDayNumber(w.end + 1),
    scoring_days: w.days.map(fromDayNumber)
  }));
}
