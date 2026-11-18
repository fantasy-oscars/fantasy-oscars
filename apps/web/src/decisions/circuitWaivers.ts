import type {
  CircuitClaim,
  CircuitClaims,
  CircuitLeagueStatus,
  CircuitRoster,
  CircuitSelectionSummary,
  CircuitWaivers
} from "../lib/types";
import {
  circuitAddNeedsDrop,
  circuitDayLabel,
  circuitRosterErrorMessage
} from "./circuitRoster";

/*
 * Waiver claims, rolling priority, chips and run results of a league's
 * season (pure). Claims are private to their owner until their window runs;
 * the server enforces every rule, and these functions only explain them.
 */

/** Waivers exist once the draft has finished. */
export function circuitWaiversVisible(status: CircuitLeagueStatus | string): boolean {
  return status === "IN_SEASON" || status === "COMPLETE";
}

/** "Dec 4, 2026 to Dec 6, 2026". */
export function circuitWindowLabel(window: { starts_on: string; ends_on: string }) {
  return `${circuitDayLabel(window.starts_on)} to ${circuitDayLabel(window.ends_on)}`;
}

/** "Pick 4 chip": a chip is named by the pick that was missed. */
export function circuitChipLabel(originalPickNumber: number): string {
  return `Pick ${originalPickNumber} chip`;
}

export function circuitChipStatusLabel(status: string): string {
  switch (status) {
    case "AVAILABLE":
      return "Available";
    case "CONSUMED":
      return "Used";
    case "EXPIRED":
      return "Expired";
    default:
      return status;
  }
}

/** What the claims section says about the window, or why there is none. */
export function circuitClaimsNote(claims: Pick<CircuitClaims, "window" | "locked">) {
  if (!claims.window) {
    return "There is no waiver window open. Claims open with each block of scoring days; until then, add free agents from your roster.";
  }
  if (claims.locked) {
    return "These claims are being processed. Results appear below once the run finishes.";
  }
  return `Claims for ${circuitWindowLabel(claims.window)} run at midnight Pacific on ${circuitDayLabel(claims.window.resolves_on)}. You can change them until then. Nobody else sees them.`;
}

/** Why a claim lost, in a player's words. */
export function circuitWaiverFailureLabel(reason: string | null): string {
  switch (reason) {
    case "SELECTION_OWNED":
      return "Someone ahead of them got it";
    case "DROP_NOT_OWNED":
      return "The drop was no longer on the roster";
    case "ROSTER_FULL":
      return "The roster was full";
    case "CATEGORY_LIMIT":
      return "The category limit was reached";
    default:
      return "Not processed";
  }
}

/** "Won" or "Lost: The roster was full". */
export function circuitClaimOutcomeLabel(claim: {
  status: string;
  failure_reason: string | null;
}): string {
  if (claim.status === "WON") return "Won";
  if (claim.status === "LOST") {
    return `Lost: ${circuitWaiverFailureLabel(claim.failure_reason)}`;
  }
  return "Pending";
}

/**
 * Whether a claim without a suitable drop may fail at capacity, and why. A
 * claim is evaluated when the window runs, after any earlier claim of the
 * member's has won, so a claim without a drop always carries a note.
 */
export function circuitClaimCapacityWarning(
  roster: CircuitRoster,
  selection: CircuitSelectionSummary,
  dropSelectionId: number | null
): string | null {
  const need = circuitAddNeedsDrop(roster, selection);
  const drop = roster.entries.find((e) => e.selection.id === dropSelectionId) ?? null;
  if (
    need === "category" &&
    drop?.selection.circuit_category_id !== selection.circuit_category_id
  ) {
    const name =
      roster.categories.find((c) => c.id === selection.circuit_category_id)?.name ??
      "this category";
    return `You hold the most ${name} picks allowed. Without dropping one of them, this claim fails.`;
  }
  if (drop) return null;
  if (need === "any") return "Your roster is full. Without a drop, this claim fails.";
  return "Without a drop, this claim fails if your roster is full when claims run, for example after an earlier claim of yours wins.";
}

/** Chips the viewer can put on a claim: available and on no other claim. */
export function circuitClaimChipOptions(
  chips: CircuitClaims["chips"],
  claimId: number | null
): CircuitClaims["chips"] {
  return chips.filter(
    (c) => c.status === "AVAILABLE" && (c.claim_id === null || c.claim_id === claimId)
  );
}

/** The pending claims, first choice first. */
export function circuitPendingClaims(claims: CircuitClaims): CircuitClaim[] {
  return claims.claims
    .filter((c) => c.status === "PENDING")
    .sort((a, b) => a.rank - b.rank || a.id - b.id);
}

export type CircuitPriorityEntry = {
  user_id: number;
  username: string;
  waiver_priority: number | null;
  chips: CircuitWaivers["chips"];
};

/** Members in rolling priority order (1 first), each with their chips by pick. */
export function circuitPriorityEntries(waivers: CircuitWaivers): CircuitPriorityEntry[] {
  return [...waivers.priority]
    .sort(
      (a, b) =>
        (a.waiver_priority ?? Number.MAX_SAFE_INTEGER) -
          (b.waiver_priority ?? Number.MAX_SAFE_INTEGER) ||
        a.username.localeCompare(b.username)
    )
    .map((p) => ({
      ...p,
      chips: waivers.chips
        .filter((c) => c.member.user_id === p.user_id)
        .sort((a, b) => a.original_pick_number - b.original_pick_number)
    }));
}

/** A person-facing message for a failed claim write. */
export function circuitClaimErrorMessage(
  err: { errorCode?: string; message?: string },
  fallback: string
): string {
  switch (err.errorCode) {
    case "CIRCUIT_WAIVER_WINDOW_CLOSED":
      return "There is no waiver window open, so claims can't change.";
    case "CIRCUIT_WAIVER_CLAIMS_LOCKED":
      return "These claims are being processed and can no longer change.";
    case "CIRCUIT_WAIVER_CLAIM_EXISTS":
      return "You already have a claim for that contender.";
    case "CIRCUIT_WAIVER_CLAIMS_CHANGED":
      return "Your claims changed elsewhere. They have been reloaded; try again.";
    case "CIRCUIT_CHIP_IN_USE":
      return "That chip is already on another claim.";
    case "CIRCUIT_CHIP_UNAVAILABLE":
      return "That chip has been used up.";
    case "CIRCUIT_MEMBERSHIP_REQUIRED":
      return "Join this season to make waiver claims.";
    default:
      return circuitRosterErrorMessage(err, fallback);
  }
}
