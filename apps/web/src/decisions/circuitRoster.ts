import type {
  CircuitLeagueCategory,
  CircuitLeagueStatus,
  CircuitRoster,
  CircuitSelectionSummary,
  CircuitTransactionKind,
  CircuitWaiverWindow
} from "../lib/types";
import { contenderFilmLabel } from "./contenders";

/*
 * Rosters and the transaction log of a league's season in a Circuit (pure).
 * Players see "season", never "Circuit". The server enforces every roster
 * rule; these functions only explain them before and after a write.
 */

export type CircuitRosterEntry = CircuitRoster["entries"][number];
export type CircuitRosterCategory = CircuitRoster["categories"][number];

/** "Name, Film (2026)" for an acting pick; "Film (2026)" otherwise. */
export function circuitSelectionLabel(selection: CircuitSelectionSummary): string {
  const film = contenderFilmLabel(selection.film);
  return selection.person ? `${selection.person.name}, ${film}` : film;
}

/** Category names by category id, for labelling contenders. */
export function circuitCategoryNames(
  categories: readonly Pick<CircuitLeagueCategory, "id" | "name">[]
): ReadonlyMap<number, string> {
  return new Map(categories.map((c) => [c.id, c.name]));
}

/**
 * The contender label followed by its category: "Static (2026) in Best Sound".
 * A film is a separate contender in each category, so a bare title is
 * ambiguous wherever two contenders of one film can appear together.
 */
export function circuitSelectionCategoryLabel(
  selection: CircuitSelectionSummary,
  categoryNames: ReadonlyMap<number, string>
): string {
  const label = circuitSelectionLabel(selection);
  const category = categoryNames.get(selection.circuit_category_id);
  return category ? `${label} in ${category}` : label;
}

/** Rosters exist from the first draft pick onwards. */
export function circuitRostersVisible(status: CircuitLeagueStatus | string): boolean {
  return status === "DRAFTING" || status === "IN_SEASON" || status === "COMPLETE";
}

/** Adds and drops are open while the season is in progress. */
export function circuitRosterWritable(status: CircuitLeagueStatus | string): boolean {
  return status === "IN_SEASON";
}

export function circuitTransactionKindLabel(
  kind: CircuitTransactionKind | string
): string {
  switch (kind) {
    case "DRAFT":
      return "Draft";
    case "SUPPLEMENTAL":
      return "Supplemental draft";
    case "WAIVER":
      return "Waiver claim";
    case "FREE_AGENT":
      return "Free agent";
    case "DROP":
      return "Drop";
    default:
      return "Transaction";
  }
}

/** "3 of 16". */
export function circuitRosterCountLabel(
  roster: Pick<CircuitRoster, "entries" | "roster_size">
) {
  return `${roster.entries.length} of ${roster.roster_size}`;
}

/** "2 of 3" with a limit, or the plain count without one. */
export function circuitCategoryCountLabel(category: CircuitRosterCategory): string {
  return category.max_owned === null
    ? String(category.owned)
    : `${category.owned} of ${category.max_owned}`;
}

/** Each category in order with the entries held in it. */
export function circuitRosterByCategory(
  roster: Pick<CircuitRoster, "categories" | "entries">
): Array<{ category: CircuitRosterCategory; entries: CircuitRosterEntry[] }> {
  return roster.categories.map((category) => ({
    category,
    entries: roster.entries.filter((e) => e.selection.circuit_category_id === category.id)
  }));
}

/** "Feb 12, 2035" for a `YYYY-MM-DD` day, without any time-zone shift. */
export function circuitDayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "Feb 12, 2035" for an instant, in the viewer's zone. */
export function circuitInstantLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

/** Why free agency is closed, and when it reopens; null while it is open. */
export function circuitFreeAgencyNote(freeAgency: {
  open: boolean;
  window: CircuitWaiverWindow | null;
}): string | null {
  if (freeAgency.open) return null;
  // Closed with no window: the window has resolved and its claims have not run yet.
  if (!freeAgency.window) {
    return "Free agency is closed while waiver claims are processed. It reopens once they have run.";
  }
  return `Free agency is closed while waiver claims are open. It reopens at midnight Pacific on ${circuitDayLabel(freeAgency.window.resolves_on)}.`;
}

function categoryOf(roster: CircuitRoster, selection: CircuitSelectionSummary) {
  return roster.categories.find((c) => c.id === selection.circuit_category_id) ?? null;
}

function categoryFull(roster: CircuitRoster, selection: CircuitSelectionSummary) {
  const category = categoryOf(roster, selection);
  return (
    category !== null &&
    category.max_owned !== null &&
    category.owned >= category.max_owned
  );
}

/**
 * What adding `selection` needs dropped first: nothing, any entry (the roster
 * is full) or an entry of the same category (its limit is reached).
 */
export function circuitAddNeedsDrop(
  roster: CircuitRoster,
  selection: CircuitSelectionSummary
): "none" | "any" | "category" {
  if (categoryFull(roster, selection)) return "category";
  if (roster.entries.length >= roster.roster_size) return "any";
  return "none";
}

/** Entries that may be dropped to make room for `selection` (all when none is pending). */
export function circuitDropOptions(
  roster: CircuitRoster,
  selection: CircuitSelectionSummary | null
): CircuitRosterEntry[] {
  if (selection && circuitAddNeedsDrop(roster, selection) === "category") {
    return roster.entries.filter(
      (e) => e.selection.circuit_category_id === selection.circuit_category_id
    );
  }
  return roster.entries;
}

/**
 * Why an add cannot be sent yet, or null when it can. A chosen drop must be
 * one of the allowed options.
 */
export function circuitAddBlockedReason(
  roster: CircuitRoster,
  selection: CircuitSelectionSummary,
  dropSelectionId: number | null
): string | null {
  if (roster.entries.some((e) => e.selection.id === selection.id)) {
    return `${circuitSelectionLabel(selection)} is already on your roster.`;
  }
  const need = circuitAddNeedsDrop(roster, selection);
  if (need === "none") return null;
  const allowed = circuitDropOptions(roster, selection).some(
    (e) => e.selection.id === dropSelectionId
  );
  if (allowed) return null;
  if (need === "category") {
    const name = categoryOf(roster, selection)?.name ?? "this category";
    return `You hold the most ${name} picks allowed. Choose one of them to drop.`;
  }
  return "Your roster is full. Choose a pick to drop.";
}

/** A person-facing message for a failed add or drop. */
export function circuitRosterErrorMessage(
  err: { errorCode?: string; message?: string },
  fallback: string
): string {
  switch (err.errorCode) {
    case "CIRCUIT_WAIVER_WINDOW_OPEN":
      return "Free agency is closed while waiver claims are open.";
    case "CIRCUIT_ROSTER_FULL":
      return "Your roster is full. Choose a pick to drop.";
    case "CIRCUIT_CATEGORY_FULL":
      return "You hold the most picks allowed in that category. Choose one of them to drop.";
    case "CIRCUIT_SELECTION_TAKEN":
      return "Another player already has that pick.";
    case "CIRCUIT_SELECTION_ALREADY_OWNED":
      return "That pick is already on your roster.";
    case "CIRCUIT_SELECTION_NOT_OWNED":
      return "That pick is no longer on your roster.";
    case "CIRCUIT_LEAGUE_NOT_IN_SEASON":
      return "Rosters can change only while the season is in progress.";
    case "CIRCUIT_MEMBERSHIP_REQUIRED":
      return "Join this season to manage a roster.";
    default:
      return err.message || fallback;
  }
}
