import type {
  CircuitClaim,
  CircuitClaims,
  CircuitLeagueCategory,
  CircuitLeagueMember,
  CircuitLeagueStatus,
  CircuitRoster,
  CircuitSelectionSummary,
  CircuitWaiverRun,
  CircuitWaivers
} from "../lib/types";
import {
  circuitAddNeedsDrop,
  circuitDayLabel,
  circuitRosterErrorMessage,
  circuitSelectionLabel
} from "./circuitRoster";
import type { CircuitMoveKind } from "./circuitMoves";
import { contenderPillView, type ContenderPillView } from "./contenderPill";

/*
 * Waiver claims, rolling priority, chips and run results of a league's
 * season (pure). Claims are private to their owner until their window runs;
 * the server enforces every rule, and these functions only explain them.
 * Players call a chip a "priority pass"; the API and these types keep "chip".
 */

/** Waivers exist once the draft has finished. */
export function circuitWaiversVisible(status: CircuitLeagueStatus | string): boolean {
  return status === "IN_SEASON" || status === "COMPLETE";
}

/** "Dec 4, 2026 to Dec 6, 2026". */
export function circuitWindowLabel(window: { starts_on: string; ends_on: string }) {
  return `${circuitDayLabel(window.starts_on)} to ${circuitDayLabel(window.ends_on)}`;
}

/** "Pick 4 priority pass": a pass is named by the pick that was missed. */
export function circuitChipLabel(originalPickNumber: number): string {
  return `Pick ${originalPickNumber} priority pass`;
}

/** "Pass for pick 4": the short name where space is tight (claim rows, results). */
export function circuitChipShortLabel(originalPickNumber: number): string {
  return `Pass for pick ${originalPickNumber}`;
}

/**
 * The Your claims note while the viewer holds passes they can still put on
 * a claim (`circuitAvailablePassPicks`), or null without one.
 */
export function circuitClaimsPassNote(
  passPicks: readonly number[],
  windowOpen: boolean
): string | null {
  if (passPicks.length === 0) return null;
  const when = windowOpen
    ? "this window's claims run"
    : "the first waiver window's claims run";
  if (passPicks.length === 1) {
    return `You have a priority pass for pick ${passPicks[0]}. Add it to a claim when you file it. It expires when ${when}.`;
  }
  const picks = `${passPicks.slice(0, -1).join(", ")} and ${passPicks[passPicks.length - 1]}`;
  return `You have priority passes for picks ${picks}. Add one to a claim when you file it. They expire when ${when}.`;
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

/**
 * Why a claim cannot be filed yet, or null when it can. With a full roster or
 * category the drop must be chosen: a pick, or an explicit "Don't drop anyone".
 * With room, an empty field means no drop.
 */
export function circuitClaimDropError(
  roster: CircuitRoster,
  selection: CircuitSelectionSummary,
  dropSelectionId: number | null,
  noDrop: boolean
): string | null {
  const need = circuitAddNeedsDrop(roster, selection);
  if (need === "none" || noDrop || dropSelectionId !== null) return null;
  if (need === "category") {
    const name =
      roster.categories.find((c) => c.id === selection.circuit_category_id)?.name ??
      "this category";
    return `You hold the most ${name} picks allowed. Choose a pick to drop, or Don't drop anyone.`;
  }
  return "Your roster is full. Choose a pick to drop, or Don't drop anyone.";
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
  /** From the league's members; null when the member has none. */
  avatarKey: string | null;
  waiver_priority: number | null;
  chips: CircuitWaivers["chips"];
};

/** Members in rolling priority order (1 first), each with their chips by pick. */
export function circuitPriorityEntries(
  waivers: CircuitWaivers,
  members: readonly Pick<CircuitLeagueMember, "user_id" | "avatar_key">[] = []
): CircuitPriorityEntry[] {
  const avatars = new Map(members.map((m) => [m.user_id, m.avatar_key]));
  return [...waivers.priority]
    .sort(
      (a, b) =>
        (a.waiver_priority ?? Number.MAX_SAFE_INTEGER) -
          (b.waiver_priority ?? Number.MAX_SAFE_INTEGER) ||
        a.username.localeCompare(b.username)
    )
    .map((p) => ({
      ...p,
      avatarKey: avatars.get(p.user_id) ?? null,
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
      return "That pass is already on another claim.";
    case "CIRCUIT_CHIP_UNAVAILABLE":
      return "That pass has been used.";
    case "CIRCUIT_MEMBERSHIP_REQUIRED":
      return "Join this season to make waiver claims.";
    default:
      return circuitRosterErrorMessage(err, fallback);
  }
}

type PillCategories = readonly Pick<
  CircuitLeagueCategory,
  "id" | "name" | "kind" | "icon_code" | "icon_variant"
>[];

/** One of the viewer's pending claims as a row of pills. */
export type CircuitClaimRow = {
  claim: CircuitClaim;
  /** "Night Train (2026)": the action icons and menu name the pick with it. */
  label: string;
  pill: ContenderPillView;
  /** The pick dropped if the claim wins, drawn dashed; null without a drop. */
  drop: ContenderPillView | null;
  /** "Pass for pick 7", or null without a pass. */
  chipLabel: string | null;
};

/** The viewer's claims as rows: the claim pill, the drop pill and the chip. */
export function circuitClaimRows(
  claims: readonly CircuitClaim[],
  categories: PillCategories
): CircuitClaimRow[] {
  return claims.map((claim) => ({
    claim,
    label: circuitSelectionLabel(claim.selection),
    pill: contenderPillView(claim.selection, categories),
    drop: claim.drop ? contenderPillView(claim.drop, categories) : null,
    chipLabel: claim.chip ? circuitChipShortLabel(claim.chip.original_pick_number) : null
  }));
}

export type CircuitClaimMenuKey = "up" | "down" | "edit" | "withdraw";

/** A claim row's phone menu: the four desktop icon actions, in their order. */
export function circuitClaimMenu(input: {
  idx: number;
  count: number;
  disabled: boolean;
}): Array<{ key: CircuitClaimMenuKey; label: string; disabled: boolean }> {
  const { idx, count, disabled } = input;
  return [
    { key: "up", label: "Move up", disabled: disabled || idx === 0 },
    { key: "down", label: "Move down", disabled: disabled || idx === count - 1 },
    { key: "edit", label: "Edit claim", disabled },
    { key: "withdraw", label: "Withdraw", disabled }
  ];
}

/** The claims note's second sentence, with two or more claims that can still change. */
export function circuitClaimsDragHint(count: number, editable: boolean): string | null {
  return editable && count >= 2 ? "Drag a claim to change its rank." : null;
}

/** The polite note after a claims reorder by any input. */
export function circuitClaimMovedNote(
  label: string,
  rank: number,
  count: number
): string {
  return `Moved claim for ${label} to rank ${rank} of ${count}.`;
}

/** A claim in a run's results: who, the outcome beside them, then the moves. */
export type CircuitWaiverResultRow = {
  key: number;
  order: number;
  username: string;
  avatarKey: string | null;
  /** "Won · Pass for pick 7", "Lost: Already owned". */
  outcome: string;
  won: boolean;
  pill: ContenderPillView;
  /** Added when won, "Claimed, lost" (muted) when lost. */
  pillMove: CircuitMoveKind;
  drop: ContenderPillView | null;
  /** Dropped (dashed) when won, "Would have dropped" (muted) when lost. */
  dropMove: CircuitMoveKind;
};

/**
 * A run's claims in the order they ran, each as its moves: a won claim adds
 * its pick and drops its drop; a lost claim's lines are muted, since nothing
 * changed hands. The pass goes in the outcome.
 */
export function circuitWaiverResultRows(
  run: Pick<CircuitWaiverRun, "claims">,
  categories: PillCategories,
  members: readonly Pick<CircuitLeagueMember, "user_id" | "avatar_key">[]
): CircuitWaiverResultRow[] {
  const avatars = new Map(members.map((m) => [m.user_id, m.avatar_key]));
  return run.claims.map((claim) => ({
    key: claim.id,
    order: claim.order,
    username: claim.member.username,
    avatarKey: avatars.get(claim.member.user_id) ?? null,
    outcome: [
      circuitClaimOutcomeLabel(claim),
      claim.chip ? circuitChipShortLabel(claim.chip.original_pick_number) : null
    ]
      .filter(Boolean)
      .join(" · "),
    won: claim.status === "WON",
    pill: contenderPillView(claim.selection, categories),
    pillMove: claim.status === "WON" ? "added" : "lostClaim",
    drop: claim.drop ? contenderPillView(claim.drop, categories) : null,
    dropMove: claim.status === "WON" ? "dropped" : "lostDrop"
  }));
}

export type CircuitPriorityAfterEntry = {
  user_id: number;
  username: string;
  avatarKey: string | null;
};

/** Priority after a run, first in line first, with each member's avatar. */
export function circuitPriorityAfter(
  run: Pick<CircuitWaiverRun, "priority_after">,
  members: readonly Pick<CircuitLeagueMember, "user_id" | "avatar_key">[]
): CircuitPriorityAfterEntry[] {
  const avatars = new Map(members.map((m) => [m.user_id, m.avatar_key]));
  return [...run.priority_after]
    .sort(
      (a, b) =>
        (a.waiver_priority ?? Number.MAX_SAFE_INTEGER) -
        (b.waiver_priority ?? Number.MAX_SAFE_INTEGER)
    )
    .map((p) => ({
      user_id: p.user_id,
      username: p.username,
      avatarKey: avatars.get(p.user_id) ?? null
    }));
}
