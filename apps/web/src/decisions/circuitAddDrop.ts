import type { CircuitClaims, CircuitLeagueStatus, CircuitRoster } from "../lib/types";

/*
 * The season page's one Add/drop entry (pure): where it leads, from the
 * viewer's free agency and the claims window. Free agency and claims never
 * overlap: free agency closes while a window is open and until its claims
 * have run. The server enforces both; this only picks the destination.
 */

/** Add/drop shows while the season is in progress, to its members. */
export function circuitAddDropVisible(input: {
  status: CircuitLeagueStatus | string;
  isMember: boolean;
}): boolean {
  return input.status === "IN_SEASON" && input.isMember;
}

export const CIRCUIT_ADD_DROP_PROCESSING_NOTE =
  "Claims are being processed. Add/drop reopens once they have run.";

export type CircuitAddDropTarget =
  /** Free agency is open: the roster page's "Add a free agent" panel. */
  | { kind: "free-agency"; page: "roster"; hash: "add"; note: null }
  /** A window is open and its claims can still change: "Claim a contender". */
  | { kind: "claims"; page: "waivers"; hash: "claim"; note: null }
  /** The window has closed or its claims are locked, and they have not run yet. */
  | { kind: "processing"; page: "waivers"; hash: null; note: string };

export function circuitAddDropTarget(input: {
  freeAgency: Pick<CircuitRoster["free_agency"], "open" | "window">;
  /**
   * The viewer's claims read; null when it could not be read. The roster's
   * window then decides: open means claims, none means processing.
   */
  claims: Pick<CircuitClaims, "window" | "locked"> | null;
}): CircuitAddDropTarget {
  if (input.freeAgency.open) {
    return { kind: "free-agency", page: "roster", hash: "add", note: null };
  }
  const claimable = input.claims
    ? input.claims.window !== null && !input.claims.locked
    : input.freeAgency.window !== null;
  if (claimable) {
    return { kind: "claims", page: "waivers", hash: "claim", note: null };
  }
  return {
    kind: "processing",
    page: "waivers",
    hash: null,
    note: CIRCUIT_ADD_DROP_PROCESSING_NOTE
  };
}
