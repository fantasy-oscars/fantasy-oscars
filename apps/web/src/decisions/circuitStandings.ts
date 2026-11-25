import type {
  CircuitLeagueStatus,
  CircuitScoreKind,
  CircuitScoredCeremony
} from "../lib/types";
import { circuitDayLabel } from "./circuitRoster";

/*
 * Standings and per-ceremony points of a league's season (pure). The server
 * sums the scoring ledger; these functions only label what it returns.
 */

/** Points accrue once the draft has finished. */
export function circuitStandingsVisible(status: CircuitLeagueStatus | string): boolean {
  return status === "IN_SEASON" || status === "COMPLETE";
}

/** "1 pt", "3 pts", "4.5 pts". */
export function circuitPointsLabel(points: number): string {
  const value = Number.isInteger(points)
    ? String(points)
    : String(Number(points.toFixed(2)));
  return `${value} ${points === 1 ? "pt" : "pts"}`;
}

export function circuitScoreKindLabel(kind: CircuitScoreKind | string): string {
  if (kind === "NOMINATION") return "Nomination";
  if (kind === "WIN") return "Win";
  return kind;
}

export function circuitCeremonyName(ceremony: CircuitScoredCeremony): string {
  return ceremony.name ?? ceremony.code ?? "Ceremony";
}

/** "Nominations Jan 21, 2026 · Winners Mar 14, 2026", with unset dates left out. */
export function circuitCeremonyDatesLabel(ceremony: CircuitScoredCeremony): string {
  const parts = [
    ceremony.nominations_on
      ? `Nominations ${circuitDayLabel(ceremony.nominations_on)}`
      : null,
    ceremony.results_on ? `Winners ${circuitDayLabel(ceremony.results_on)}` : null
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(" · ") : "Dates to be announced";
}

/** The standings screen's views, kept in `?view=`. */
export type CircuitStandingsViewKey = "leaderboard" | "results" | "ceremonies";

/**
 * The view switch's segments: Final results only once the season is
 * complete, between Leaderboard and By ceremony.
 */
export function circuitStandingsViews(
  complete: boolean
): Array<{ value: CircuitStandingsViewKey; label: string }> {
  return [
    { value: "leaderboard", label: "Leaderboard" },
    ...(complete ? [{ value: "results" as const, label: "Final results" }] : []),
    { value: "ceremonies", label: "By ceremony" }
  ];
}

/**
 * The view a `?view=` value asks for. Missing or unknown values, and
 * `results` before the season is complete, fall back to the leaderboard.
 */
export function parseCircuitStandingsView(
  raw: string | null | undefined,
  complete: boolean
): CircuitStandingsViewKey {
  if (raw === "ceremonies") return "ceremonies";
  if (raw === "results" && complete) return "results";
  return "leaderboard";
}
