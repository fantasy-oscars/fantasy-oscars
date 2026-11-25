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

/**
 * The roster page's one flat list: season category order, then pick order
 * (the draft slot, then acquisition time). The pill's icon names the category.
 */
export function circuitRosterFlatEntries(
  roster: Pick<CircuitRoster, "categories" | "entries">
): CircuitRosterEntry[] {
  const rank = new Map(roster.categories.map((c, idx) => [c.id, idx]));
  const rankOf = (e: CircuitRosterEntry) =>
    rank.get(e.selection.circuit_category_id) ?? roster.categories.length;
  return [...roster.entries].sort(
    (a, b) =>
      rankOf(a) - rankOf(b) ||
      a.acquired_at.localeCompare(b.acquired_at) ||
      a.acquired_transaction_id - b.acquired_transaction_id
  );
}

/** One item of the roster's limits line: "3 of 3" beside the category's icon. */
export type CircuitRosterLimitItem = {
  categoryId: number;
  name: string;
  iconCode: string;
  iconVariant: "default" | "inverted";
  label: string;
  full: boolean;
};

/**
 * The limits line under the roster: each category with a limit, in season
 * order. Empty when the season sets no per-category limits.
 */
export function circuitRosterLimitItems(
  roster: Pick<CircuitRoster, "categories">,
  categories: readonly Pick<CircuitLeagueCategory, "id" | "icon_code" | "icon_variant">[]
): CircuitRosterLimitItem[] {
  return roster.categories.flatMap((category) => {
    if (category.max_owned === null) return [];
    const league = categories.find((c) => c.id === category.id);
    return [
      {
        categoryId: category.id,
        name: category.name,
        iconCode: league?.icon_code ?? "",
        iconVariant: league?.icon_variant === "inverted" ? "inverted" : "default",
        label: `${category.owned} of ${category.max_owned}`,
        full: category.owned >= category.max_owned
      }
    ];
  });
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

/** The drop select's explicit "no drop" option, listed first. */
export const CIRCUIT_NO_DROP_LABEL = "Don't drop anyone";

/**
 * The drop select's placeholder: ask for a drop when the roster or the
 * chosen category is full, so an add is not sent without one.
 */
export function circuitDropPlaceholder(
  roster: Pick<CircuitRoster, "entries" | "roster_size" | "categories">,
  categoryId: number | null
): string {
  const category = roster.categories.find((c) => c.id === categoryId) ?? null;
  const categoryFull =
    category !== null &&
    category.max_owned !== null &&
    category.owned >= category.max_owned;
  return categoryFull || roster.entries.length >= roster.roster_size
    ? "Select a pick to drop"
    : CIRCUIT_NO_DROP_LABEL;
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
