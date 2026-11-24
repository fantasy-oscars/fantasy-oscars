import { describe, expect, it } from "vitest";
import {
  buildSeasonList,
  orderSeasonList,
  seasonListKindLabel,
  seasonListStatusRank,
  type SeasonListItem
} from "@/decisions/seasonList";
import type { CircuitLeagueSummary, SeasonSummary } from "@/lib/types";

function ceremony(
  id: number,
  statusLabel: string,
  createdAt = "2026-11-01T00:00:00Z"
): SeasonListItem {
  return {
    kind: "ceremony",
    id,
    title: `Ceremony ${id}`,
    statusLabel,
    createdAt,
    ceremonyId: id,
    ceremonyCode: null,
    isNavigable: true
  };
}

function full(
  id: number,
  statusLabel: string,
  createdAt = "2026-11-01T00:00:00Z"
): SeasonListItem {
  return {
    kind: "full",
    id,
    title: `Awards ${id}`,
    statusLabel,
    createdAt,
    memberCount: 1
  };
}

describe("season list kind labels", () => {
  it("names each kind in plain words, never as a Circuit", () => {
    expect(seasonListKindLabel(ceremony(1, "Pre-draft"))).toBe("Single ceremony");
    expect(seasonListKindLabel({ ...full(2, "Pre-draft"), memberCount: 1 })).toBe(
      "Full awards season · 1 member"
    );
    expect(seasonListKindLabel({ ...full(2, "Pre-draft"), memberCount: 4 })).toBe(
      "Full awards season · 4 members"
    );
  });
});

describe("season list order", () => {
  it("ranks live, then running, then upcoming, then finished", () => {
    expect(
      ["Drafting", "Paused", "In progress", "Pre-draft"].map(seasonListStatusRank)
    ).toEqual([0, 0, 1, 2]);
    expect(seasonListStatusRank("Complete")).toBe(3);
    expect(seasonListStatusRank("Closed")).toBe(3);
  });

  it("orders by status rank, then newest first, then full before single and id descending", () => {
    const ordered = orderSeasonList([
      ceremony(1, "Complete"),
      ceremony(2, "Pre-draft", "2026-10-01T00:00:00Z"),
      full(3, "Pre-draft", "2026-11-05T00:00:00Z"),
      ceremony(4, "Drafting"),
      full(5, "In progress"),
      ceremony(6, "Pre-draft", "2026-11-05T00:00:00Z"),
      ceremony(7, "Pre-draft", "2026-11-05T00:00:00Z")
    ]);
    expect(ordered.map((s) => `${s.kind}-${s.id}`)).toEqual([
      "ceremony-4",
      "full-5",
      "full-3",
      "ceremony-7",
      "ceremony-6",
      "ceremony-2",
      "ceremony-1"
    ]);
  });
});

describe("building the season list", () => {
  it("merges ceremony seasons and full seasons into one ordered list", () => {
    const seasons = [
      {
        id: 7,
        league_id: 3,
        ceremony_id: 1,
        ceremony_name: "Golden Reel 2027",
        ceremony_code: "golden-2027",
        status: "EXTANT",
        created_at: "2026-10-01T00:00:00Z",
        draft_status: "CANCELLED",
        is_active_ceremony: true
      }
    ] as SeasonSummary[];
    const circuitLeagues = [
      {
        id: 4,
        circuit_name: "Awards Season 2027",
        status: "SETUP",
        created_at: "2026-11-01T00:00:00Z",
        member_count: 2
      }
    ] as CircuitLeagueSummary[];
    expect(buildSeasonList({ seasons, circuitLeagues })).toEqual([
      {
        kind: "full",
        id: 4,
        title: "Awards Season 2027",
        statusLabel: "Pre-draft",
        createdAt: "2026-11-01T00:00:00Z",
        memberCount: 2
      },
      {
        kind: "ceremony",
        id: 7,
        title: "Golden Reel 2027",
        statusLabel: "Closed",
        createdAt: "2026-10-01T00:00:00Z",
        ceremonyId: 1,
        ceremonyCode: "golden-2027",
        isNavigable: false
      }
    ]);
  });
});
