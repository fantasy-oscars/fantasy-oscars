import type { CircuitClaims, CircuitLeagueStatus } from "../lib/types";
import { circuitDraftLinkLabel } from "./circuitDraft";
import { circuitRostersVisible } from "./circuitRoster";
import { circuitStandingsVisible } from "./circuitStandings";
import { circuitWaiversVisible } from "./circuitWaivers";

/*
 * The season page's tiles (pure): which parts of the season it offers for a
 * status, in order, each with a line about it. The visibility rules are the
 * screens' own; this only orders and describes them.
 */

export type CircuitSeasonTileKey =
  "draft" | "roster" | "transactions" | "waivers" | "standings" | "rules";

export type CircuitSeasonTile = {
  key: CircuitSeasonTileKey;
  title: string;
  description: string;
  /** A second line in the body voice: the Waivers tile's priority pass line. */
  note: string | null;
};

function draftDescription(status: CircuitLeagueStatus | string): string {
  switch (status) {
    case "DRAFTING":
      return "The draft is on. Take your seat.";
    case "IN_SEASON":
    case "COMPLETE":
      return "Every pick from the draft.";
    default:
      return "Queue contenders before the draft starts.";
  }
}

/**
 * The pick numbers of the viewer's priority passes they can still put on a
 * claim (available and on no claim), earliest first. Null claims (not read
 * in this status) give none.
 */
export function circuitAvailablePassPicks(
  chips: CircuitClaims["chips"] | null | undefined
): number[] {
  return (chips ?? [])
    .filter((c) => c.status === "AVAILABLE" && c.claim_id === null)
    .map((c) => c.original_pick_number)
    .sort((a, b) => a - b);
}

/** "You have a priority pass for pick 5. Use it on a claim in the first waiver window." */
export function circuitPassTileNote(passPicks: number[]): string | null {
  if (passPicks.length === 0) return null;
  if (passPicks.length === 1) {
    return `You have a priority pass for pick ${passPicks[0]}. Use it on a claim in the first waiver window.`;
  }
  const picks = `${passPicks.slice(0, -1).join(", ")} and ${passPicks[passPicks.length - 1]}`;
  return `You have priority passes for picks ${picks}. Use them on claims in the first waiver window.`;
}

export function circuitSeasonTiles(input: {
  status: CircuitLeagueStatus | string;
  isMember: boolean;
  /** `circuitAvailablePassPicks` of the viewer's claims read. */
  passPicks: number[];
}): CircuitSeasonTile[] {
  const { status, isMember } = input;
  const tiles: CircuitSeasonTile[] = [
    {
      key: "draft",
      title: circuitDraftLinkLabel(status),
      description: draftDescription(status),
      note: null
    }
  ];
  if (circuitRostersVisible(status)) {
    tiles.push(
      isMember
        ? {
            key: "roster",
            title: "Your roster",
            description: "Your picks and what they have scored.",
            note: null
          }
        : {
            key: "roster",
            title: "Rosters",
            description: "Every player's picks and points.",
            note: null
          },
      {
        key: "transactions",
        title: "Transactions",
        description: "Every add and drop, newest first.",
        note: null
      }
    );
  }
  if (circuitWaiversVisible(status)) {
    tiles.push({
      key: "waivers",
      title: "Waivers",
      description: "Claims, priority and results.",
      note: isMember ? circuitPassTileNote(input.passPicks) : null
    });
  }
  if (circuitStandingsVisible(status)) {
    tiles.push({
      key: "standings",
      title: "Standings",
      description:
        status === "COMPLETE"
          ? "Final standings and results."
          : "The leaderboard and points by ceremony.",
      note: null
    });
  }
  tiles.push({
    key: "rules",
    title: "Rules",
    description: "How scoring, rosters and waivers work.",
    note: null
  });
  return tiles;
}
