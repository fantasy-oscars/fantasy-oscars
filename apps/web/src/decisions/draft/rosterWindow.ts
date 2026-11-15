// Roster rotation window model (docs/design/prescriptions/06, 5.4). Pure: no IO.

export type RosterLayout = "desktop" | "phone";

export const ROSTER_PEEK_DESKTOP_PX = 48;
export const ROSTER_PEEK_PHONE_PX = 28;
export const ROSTER_COLUMN_GAP_PX = 12;
export const ROSTER_MAX_CAPACITY = 6;
export const ROSTER_MIN_COLUMN_PX = 176;
/** A horizontal drag longer than this steps one seat. */
export const ROSTER_DRAG_STEP_PX = 40;

export type RosterGeometry = {
  peek: number;
  gap: number;
  /** Space either side of the window: the peek plus one gap. */
  side: number;
  /** Seats visible at once. */
  capacity: number;
  columnWidth: number;
  /** Distance between the left edges of neighbouring columns. */
  step: number;
};

export function rosterGeometry(
  boardWidthPx: number,
  layout: RosterLayout
): RosterGeometry {
  const peek = layout === "phone" ? ROSTER_PEEK_PHONE_PX : ROSTER_PEEK_DESKTOP_PX;
  const gap = ROSTER_COLUMN_GAP_PX;
  const side = peek + gap;
  const inner = boardWidthPx - 2 * side;
  const capacity =
    layout === "phone"
      ? 1
      : Math.min(
          ROSTER_MAX_CAPACITY,
          Math.max(1, Math.floor((inner + gap) / (ROSTER_MIN_COLUMN_PX + gap)))
        );
  const columnWidth = Math.max(0, (inner - gap * (capacity - 1)) / capacity);
  return { peek, gap, side, capacity, columnWidth, step: columnWidth + gap };
}

function lastStart(capacity: number, count: number): number {
  return Math.max(0, count - capacity);
}

function clampStart(start: number, capacity: number, count: number): number {
  return Math.min(Math.max(0, start), lastStart(capacity, count));
}

/** One seat in `dir`, clamped so the window stays full. No wrap. */
export function stepWindow(
  start: number,
  dir: -1 | 1,
  capacity: number,
  count: number
): number {
  return clampStart(start + dir, capacity, count);
}

/** The window whose first seat is `seatIndex`, clamped to a full window. */
export function windowForSeat(
  seatIndex: number,
  capacity: number,
  count: number
): number {
  return clampStart(seatIndex, capacity, count);
}

export function clampWindowStart(start: number, capacity: number, count: number): number {
  return clampStart(start, capacity, count);
}

/** Text for the hidden live region. */
export function rosterAnnouncement(
  start: number,
  capacity: number,
  count: number,
  layout: RosterLayout
): string {
  const first = start + 1;
  const last = Math.min(count, start + capacity);
  if (layout === "phone" || first === last) return `Seat ${first} of ${count}`;
  return `Seats ${first} to ${last} of ${count}`;
}
