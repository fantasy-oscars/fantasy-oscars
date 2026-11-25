import { describe, expect, it } from "vitest";
import { buildSeasonIndexCards } from "@/decisions/seasons/seasonIndexCards";
import { computeSeasonsIndexGrouping } from "@/decisions/seasonsIndex";
import type {
  CeremonySummary,
  CircuitLeagueSummary,
  LeagueSummary,
  SeasonSummary
} from "@/lib/types";

const league = { id: 7, name: "Friends" } as LeagueSummary;
const ceremony = {
  id: 3,
  name: "Oscars 2027",
  year: 2027,
  starts_at: "2027-03-01T00:00:00Z"
} as CeremonySummary;

const ceremonySeason = {
  id: 11,
  ceremony_id: 3,
  ceremony_code: "oscars-2027",
  status: "EXTANT",
  draft_status: "PENDING",
  is_active_ceremony: true,
  ceremony_results_finalized_at: null
} as unknown as SeasonSummary;

const fullSeason = {
  id: 21,
  circuit_name: "2026-27 Awards Season",
  circuit_status: "ACTIVE",
  status: "SETUP",
  member_count: 4
} as unknown as CircuitLeagueSummary;

function build() {
  return buildSeasonIndexCards({
    seasonResults: [{ league, seasons: [ceremonySeason] }],
    circuitResults: [{ league, circuitLeagues: [fullSeason] }],
    ceremonyById: new Map([[ceremony.id, ceremony]])
  });
}

describe("My seasons cards", () => {
  it("lists full awards seasons beside single-ceremony ones, labelled by kind", () => {
    const cards = build();
    expect(cards.map((c) => [c.kind, c.season_id, c.kind_label])).toEqual([
      ["ceremony", 11, "Single ceremony"],
      ["full", 21, "Full awards season · 4 members"]
    ]);
    const full = cards.find((c) => c.kind === "full");
    expect(full).toMatchObject({
      league_id: 7,
      league_name: "Friends",
      ceremony_name: "2026-27 Awards Season",
      status_label: "Pre-draft",
      is_navigable: true
    });
  });

  it("still builds ceremony cards when no full seasons were loaded", () => {
    const cards = buildSeasonIndexCards({
      seasonResults: [{ league, seasons: [ceremonySeason] }],
      ceremonyById: new Map([[ceremony.id, ceremony]])
    });
    expect(cards.map((c) => c.kind)).toEqual(["ceremony"]);
  });
});

describe("My seasons grouping", () => {
  it("by ceremony, gathers full seasons in their own group ahead of the ceremonies", () => {
    const { groupOrder, grouped } = computeSeasonsIndexGrouping({
      mode: "ceremony",
      seasons: build()
    });
    expect(groupOrder.map((g) => g.label)).toEqual([
      "Full awards seasons",
      "Oscars 2027"
    ]);
    expect(grouped.get(groupOrder[0]!.id)?.map((c) => c.kind)).toEqual(["full"]);
  });

  it("by league, keeps both kinds in the league's group, full first", () => {
    const { groupOrder, grouped } = computeSeasonsIndexGrouping({
      mode: "league",
      seasons: build()
    });
    expect(groupOrder.map((g) => g.label)).toEqual(["Friends"]);
    expect(grouped.get(groupOrder[0]!.id)?.map((c) => c.kind)).toEqual([
      "full",
      "ceremony"
    ]);
  });
});
