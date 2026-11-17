import type {
  CircuitLeagueStatus,
  CircuitLeagueSummary,
  CircuitSummary
} from "../lib/types";

/*
 * A league's competition in one Circuit. Players see it as a season, so every
 * label here says "season", never "Circuit".
 */

/** Pick clock the form offers when a timer is switched on. */
export const DEFAULT_PICK_TIMER_SECONDS = 90;

/** Status pill text; matches the labels `statusTone` already knows. */
export function circuitLeagueStatusLabel(status: CircuitLeagueStatus | string): string {
  switch (status) {
    case "SETUP":
      return "Open";
    case "INITIALIZED":
      return "Pre-draft";
    case "DRAFTING":
      return "Drafting";
    case "IN_SEASON":
      return "In progress";
    case "COMPLETE":
      return "Complete";
    default:
      return "Closed";
  }
}

export function circuitLeagueMemberCountLabel(count: number): string {
  return count === 1 ? "1 member" : `${count} members`;
}

/**
 * What a commissioner may still change (owner question 11): everything in
 * setup; only the pick clock and auto-draft once initialised; nothing after the
 * draft starts. Membership and events follow `all`.
 */
export function circuitLeagueEditable(status: CircuitLeagueStatus | string): {
  all: boolean;
  draftClock: boolean;
} {
  return {
    all: status === "SETUP",
    draftClock: status === "SETUP" || status === "INITIALIZED"
  };
}

/** The ceremonies a grouped event spans, for its checkbox description. */
export function circuitLeagueEventDescription(event: {
  is_group: boolean;
  ceremonies: Array<{ name: string }>;
}): string | null {
  if (!event.is_group) return null;
  if (event.ceremonies.length === 0) return "No ceremonies yet";
  return event.ceremonies.map((c) => c.name).join(", ");
}

/** Circuits a commissioner can still start in this league: public, not archived, not started. */
export function startableCircuits(
  circuits: CircuitSummary[],
  started: Array<Pick<CircuitLeagueSummary, "circuit_id">>
): CircuitSummary[] {
  const taken = new Set(started.map((c) => c.circuit_id));
  return circuits.filter((c) => c.status === "ACTIVE" && !taken.has(c.id));
}

/*
 * Read-only values, for viewers who cannot edit a section (players, and
 * commissioners once it is frozen). States are words, not greyed controls.
 */

export function onOffLabel(on: boolean): string {
  return on ? "On" : "Off";
}

export function pickClockLabel(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "Off";
  return seconds === 1 ? "1 second" : `${seconds} seconds`;
}

export function circuitLeagueEventValue(event: {
  enabled: boolean;
  weight: number;
}): string {
  return event.enabled ? `On · weight ${event.weight}` : "Off";
}

/** What the viewer's own membership looks like, for the bar under the header. */
export function circuitLeagueMembershipNote(input: {
  open: boolean;
  isMember: boolean;
}): string {
  if (input.open) {
    return input.isMember ? "You’re in this season." : "You’re not in this season yet.";
  }
  return input.isMember
    ? "You’re in this season. Membership is locked."
    : "Membership is locked.";
}
