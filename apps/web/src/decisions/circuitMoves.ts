import type { ContenderPillState } from "./contenderPill";

/*
 * A move in a season log (pure): what came in and what went out, each as an
 * icon line with a pill. Transactions, waiver results and claim rows draw the
 * same lines. Bare plus and minus glyphs, not the circled add and drop
 * buttons, so a log line never looks like a control.
 */

export type CircuitMoveKind =
  "added" | "dropped" | "claim" | "claimDrop" | "lostClaim" | "lostDrop";

export type CircuitMoveLine = {
  /** Material Symbols glyph. */
  glyph: "add" | "remove";
  /** The icon's accessible name and tooltip; it also starts the pill's name. */
  label: string;
  pillState: ContenderPillState;
};

const MOVE_LINES: Record<CircuitMoveKind, CircuitMoveLine> = {
  added: { glyph: "add", label: "Added", pillState: "default" },
  dropped: { glyph: "remove", label: "Dropped", pillState: "dropped" },
  claim: { glyph: "add", label: "Claim", pillState: "default" },
  claimDrop: { glyph: "remove", label: "Drop if the claim wins", pillState: "dropped" },
  lostClaim: { glyph: "add", label: "Claimed, lost", pillState: "muted" },
  // Muted, not dashed: nothing left the roster.
  lostDrop: { glyph: "remove", label: "Would have dropped", pillState: "muted" }
};

export function circuitMoveLine(kind: CircuitMoveKind): CircuitMoveLine {
  return MOVE_LINES[kind];
}

/** The added line always comes first, then the dropped line. */
export function circuitMoveOrder<T extends { kind: CircuitMoveKind }>(moves: T[]): T[] {
  return [...moves].sort(
    (a, b) =>
      Number(MOVE_LINES[a.kind].glyph === "remove") -
      Number(MOVE_LINES[b.kind].glyph === "remove")
  );
}
