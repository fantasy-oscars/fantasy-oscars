import type { CircuitLeagueSummary, CircuitSummary } from "../lib/types";
import { startableCircuits } from "./circuitLeague";

/*
 * The kinds of season Create season offers. A Circuit competition is the
 * "full awards season"; no player copy here names it a Circuit.
 */

export type SeasonKind = "ceremony" | "full";

export const SEASON_KIND_ORDER: readonly SeasonKind[] = ["ceremony", "full"];

/**
 * Full awards seasons are behind a gate: only a super admin is offered them.
 * Everyone else sees single ceremony alone.
 */
export function visibleSeasonKinds(fullSeasonEnabled: boolean): readonly SeasonKind[] {
  return fullSeasonEnabled ? SEASON_KIND_ORDER : ["ceremony"];
}

export const SEASON_KIND_COPY: Record<SeasonKind, { name: string; description: string }> =
  {
    ceremony: {
      name: "Single ceremony",
      description:
        "Draft from one awards night's nominees, like the Oscars, and score when your picks win."
    },
    full: {
      name: "Full awards season",
      description:
        "Draft once and score across the whole awards season, from the first nominations to the final ceremony. Add and drop contenders along the way."
    }
  };

export const NO_SEASON_KIND_NOTE =
  "Check back when the next ceremony or awards season opens.";

export type SeasonKindAvailability =
  | { available: true }
  /** `retry` marks a reason that came from a failed load, which can be tried again. */
  | { available: false; reason: string; retry: boolean };

/** Single ceremony: today's rule, at least one ceremony open for leagues. */
export function ceremonyKindAvailability(ceremonyCount: number): SeasonKindAvailability {
  return ceremonyCount > 0
    ? { available: true }
    : {
        available: false,
        reason: "No ceremonies are open for leagues right now.",
        retry: false
      };
}

/**
 * Full awards season: at least one active Circuit not yet running in this
 * league. `null` lists mean they failed to load.
 */
export function fullKindAvailability(input: {
  circuits: CircuitSummary[] | null;
  started: Array<Pick<CircuitLeagueSummary, "circuit_id">> | null;
}): SeasonKindAvailability {
  if (input.circuits === null || input.started === null) {
    return {
      available: false,
      reason: "Couldn't check for open awards seasons.",
      retry: true
    };
  }
  const active = input.circuits.filter((c) => c.status === "ACTIVE");
  if (active.length === 0) {
    return {
      available: false,
      reason: "No full awards season is open right now.",
      retry: false
    };
  }
  if (startableCircuits(input.circuits, input.started).length > 0) {
    return { available: true };
  }
  return {
    available: false,
    reason:
      active.length === 1
        ? `This league already plays ${active[0]!.name}.`
        : "This league already plays every open awards season.",
    retry: false
  };
}

export function parseSeasonKind(raw: string | null | undefined): SeasonKind | null {
  return raw === "ceremony" || raw === "full" ? raw : null;
}

/**
 * The kind shown as chosen: the requested one when it is available; otherwise
 * the only available kind; otherwise none (both open and none asked for yet).
 */
export function selectedSeasonKind(input: {
  requested: SeasonKind | null;
  availability: Record<SeasonKind, SeasonKindAvailability>;
  order?: readonly SeasonKind[];
}): SeasonKind | null {
  const { requested, availability, order = SEASON_KIND_ORDER } = input;
  if (requested && order.includes(requested) && availability[requested].available) {
    return requested;
  }
  const open = order.filter((k) => availability[k].available);
  return open.length === 1 ? open[0]! : null;
}

/** The message on Create season for a viewer who is not a commissioner. */
export const NOT_COMMISSIONER_MESSAGE =
  "Only the league's commissioners can create seasons.";

/**
 * Only a league's owner and co-owners create seasons. A viewer whose member
 * list could not load (not in the league) cannot.
 */
export function canCreateSeasons(
  members: ReadonlyArray<{ user_id: number; role: string }> | null,
  userId: number
): boolean {
  if (!members || !Number.isFinite(userId)) return false;
  return members.some(
    (m) => m.user_id === userId && (m.role === "OWNER" || m.role === "CO_OWNER")
  );
}
