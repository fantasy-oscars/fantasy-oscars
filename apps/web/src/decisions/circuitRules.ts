import type { CircuitLeagueDetail } from "../lib/types";
import { circuitDayLabel } from "./circuitRoster";
import { circuitPointsLabel } from "./circuitStandings";
import { weightLabel } from "./fullSeasonSummary";

/*
 * The rules page of a league's season (pure). The ownership instant and the
 * window rule are the same for every league; the events, roster size, limits,
 * points and weights are read from the league's own settings, never from the
 * defaults.
 */

export const OWNERSHIP_INSTANT_RULE =
  "A nomination or a win is scored for whoever owns the contender at midnight Pacific (00:00 America/Los_Angeles) at the start of the day the announcement is made. Nominations and wins announced on the same day share that moment. Drops made later that day do not take back points already earned, and picks added after that moment do not score for that day.";

export const WINDOW_RULE =
  "Free agency closes at the same moment, when a scoring day opens a waiver window, and reopens at midnight Pacific after the window’s last day. A window covers the scoring day and the two days after it; a scoring day inside an open window extends it, and consecutive scoring days share one window. While a window is open, players file ranked waiver claims instead of adding free agents, and the claims run when the window ends. Dropping a contender is allowed at any time. There is no window after the season’s last scoring day.";

export type RulesCeremony = { name: string; datesLabel: string };

export type RulesEvent = {
  id: number;
  name: string;
  /** "×1", "×2". */
  weight: string;
  ceremonies: RulesCeremony[];
};

export type RulesCategory = {
  id: number;
  name: string;
  /** "×2", or null at the default weight of 1. */
  weight: string | null;
  limit: string;
};

export type CircuitRules = {
  events: RulesEvent[];
  /** The events that do not count in this league, for the "not counted" line. */
  eventsOff: string[];
  scoring: { nomination: string; win: string };
  rosterLine: string;
  categories: RulesCategory[];
  /** "Every category counts equally" or null when some are weighted. */
  categoriesNote: string | null;
};

function datesLabel(c: { nominations_on: string | null; results_on: string | null }) {
  const parts = [
    c.nominations_on ? `Nominations ${circuitDayLabel(c.nominations_on)}` : null,
    c.results_on ? `Winners ${circuitDayLabel(c.results_on)}` : null
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(" · ") : "Dates to be announced";
}

const weightOrNull = (weight: number) => (weight === 1 ? null : weightLabel(weight));

export function circuitRulesFrom(detail: CircuitLeagueDetail): CircuitRules {
  const { circuit_league: settings } = detail;
  const events = [...detail.events].sort((a, b) => a.sort_index - b.sort_index);
  const categories = [...detail.categories].sort((a, b) => a.sort_index - b.sort_index);
  const size = settings.roster_size;
  return {
    events: events
      .filter((e) => e.enabled)
      .map((e) => ({
        id: e.id,
        name: e.name,
        weight: weightLabel(e.weight),
        ceremonies: e.ceremonies.map((c) => ({ name: c.name, datesLabel: datesLabel(c) }))
      })),
    eventsOff: events.filter((e) => !e.enabled).map((e) => e.name),
    scoring: {
      nomination: `${circuitPointsLabel(settings.nomination_points)} for each nomination`,
      win: `${circuitPointsLabel(settings.win_bonus_points)} more for each win`
    },
    rosterLine: `Each player holds up to ${size} ${size === 1 ? "contender" : "contenders"}.`,
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      weight: weightOrNull(c.weight),
      limit: c.max_owned === null ? "No limit" : `At most ${c.max_owned}`
    })),
    categoriesNote: categories.every((c) => c.weight === 1)
      ? "Every category counts equally."
      : null
  };
}
