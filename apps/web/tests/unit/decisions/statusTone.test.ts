import { describe, expect, it } from "vitest";
import { statusTone } from "../../../src/decisions/statusTone";
import {
  computeSeasonLifecycleLabelFromRow,
  computeSeasonProgression
} from "../../../src/decisions/season";
import { buildSeasonIndexCards } from "../../../src/decisions/seasons/seasonIndexCards";
import { circuitLeagueStatusLabel } from "../../../src/decisions/circuitLeague";

describe("statusTone", () => {
  it.each([
    ["Pre-draft", "neutral", null],
    ["Closed", "neutral", null],
    ["Drafting", "drafting", "dot"],
    ["Paused", "drafting", "pause"],
    ["Complete", "complete", "check"],
    ["In progress", "live", "dot"]
  ] as const)("%s reads %s with mark %s", (label, tone, mark) => {
    expect(statusTone(label)).toEqual({ tone, mark });
  });

  it("ignores case and surrounding space, and treats unknown labels as neutral", () => {
    expect(statusTone("  drafting ")).toEqual({ tone: "drafting", mark: "dot" });
    expect(statusTone("Something else")).toEqual({ tone: "neutral", mark: null });
  });

  it("covers every label the season progression returns", () => {
    const cases: Array<[Parameters<typeof computeSeasonProgression>[0], string]> = [
      [{ isArchived: true, draftStatus: null }, "neutral"],
      [{ isArchived: false, draftStatus: "PENDING" }, "neutral"],
      [{ isArchived: false, draftStatus: "LIVE" }, "drafting"],
      [{ isArchived: false, draftStatus: "PAUSED" }, "drafting"],
      [{ isArchived: false, draftStatus: "COMPLETED" }, "live"],
      [
        {
          isArchived: false,
          draftStatus: "COMPLETED",
          resultsFinalizedAt: "2027-03-01T00:00:00Z"
        },
        "complete"
      ]
    ];
    for (const [args, tone] of cases) {
      expect(statusTone(computeSeasonProgression(args)).tone).toBe(tone);
    }
  });

  it("gives a paused draft the same label and tone on every surface", () => {
    expect(
      computeSeasonLifecycleLabelFromRow({
        seasonStatus: "EXTANT",
        draftStatus: "PAUSED",
        isActiveCeremony: true
      })
    ).toBe("Paused");
    expect(computeSeasonProgression({ isArchived: false, draftStatus: "PAUSED" })).toBe(
      "Paused"
    );
    const cards = buildSeasonIndexCards({
      seasonResults: [
        {
          league: { id: 1, name: "L" } as never,
          seasons: [
            { id: 1, ceremony_id: 1, draft_status: "PAUSED", status: "EXTANT" } as never
          ]
        }
      ],
      ceremonyById: new Map()
    });
    expect(cards[0].status_label).toBe("Paused");
    expect(statusTone("Paused")).toEqual({ tone: "drafting", mark: "pause" });
  });

  it("reads a season set up before its ceremony goes live as Pre-draft, coming soon", () => {
    const cards = buildSeasonIndexCards({
      seasonResults: [
        {
          league: { id: 1, name: "L" } as never,
          seasons: [
            {
              id: 1,
              ceremony_id: 1,
              draft_status: "PENDING",
              status: "EXTANT",
              ceremony_status: "PUBLISHED",
              is_active_ceremony: true
            } as never,
            {
              id: 2,
              ceremony_id: 2,
              draft_status: "PENDING",
              status: "EXTANT",
              ceremony_status: "ACTIVE",
              is_active_ceremony: true
            } as never
          ]
        }
      ],
      ceremonyById: new Map([
        [
          1,
          {
            id: 1,
            code: "a",
            name: "A",
            status: "PUBLISHED",
            starts_at: "2028-03-05T12:00:00Z"
          }
        ]
      ])
    });
    expect(cards.map((c) => [c.status_label, c.note])).toEqual([
      ["Pre-draft", "Coming soon · Mar 5, 2028"],
      ["Pre-draft", null]
    ]);
  });

  it("uses the same four words for a single ceremony and a full season", () => {
    const finalized = "2027-03-01T00:00:00Z";
    const single = (draftStatus: string, resultsFinalizedAt: string | null = null) =>
      computeSeasonProgression({ isArchived: false, draftStatus, resultsFinalizedAt });
    const indexCard = (draftStatus: string, resultsFinalizedAt: string | null = null) =>
      buildSeasonIndexCards({
        seasonResults: [
          {
            league: { id: 1, name: "L" } as never,
            seasons: [
              {
                id: 1,
                ceremony_id: 1,
                status: "EXTANT",
                is_active_ceremony: true,
                draft_status: draftStatus,
                ceremony_results_finalized_at: resultsFinalizedAt
              } as never
            ]
          }
        ],
        ceremonyById: new Map()
      })[0].status_label;

    // Pre-draft, Drafting, In progress (draft done, ceremony not final), Complete.
    for (const label of [single, indexCard]) {
      expect(["PENDING", "LIVE", "COMPLETED"].map((d) => label(d))).toEqual([
        "Pre-draft",
        "Drafting",
        "In progress"
      ]);
      expect(label("COMPLETED", finalized)).toBe("Complete");
    }
    expect(
      computeSeasonLifecycleLabelFromRow({
        seasonStatus: "EXTANT",
        draftStatus: "COMPLETED",
        isActiveCeremony: true,
        resultsFinalizedAt: finalized
      })
    ).toBe("Complete");

    expect(
      ["SETUP", "INITIALIZED", "DRAFTING", "IN_SEASON", "COMPLETE"].map(
        circuitLeagueStatusLabel
      )
    ).toEqual(["Pre-draft", "Pre-draft", "Drafting", "In progress", "Complete"]);
  });

  it("keeps Closed first for an archived or inactive season, even once final", () => {
    expect(
      computeSeasonProgression({
        isArchived: true,
        draftStatus: "COMPLETED",
        resultsFinalizedAt: "2027-03-01T00:00:00Z"
      })
    ).toBe("Closed");
    expect(
      computeSeasonLifecycleLabelFromRow({
        seasonStatus: "COMPLETE",
        draftStatus: "COMPLETED",
        isActiveCeremony: false
      })
    ).toBe("Closed");
  });

  it("maps the league row labels", () => {
    const row = (seasonStatus: string, draftStatus: string, active = true) =>
      statusTone(
        computeSeasonLifecycleLabelFromRow({
          seasonStatus,
          draftStatus,
          isActiveCeremony: active
        })
      );
    expect(row("EXTANT", "PENDING").tone).toBe("neutral");
    expect(row("EXTANT", "LIVE")).toEqual({ tone: "drafting", mark: "dot" });
    expect(row("EXTANT", "COMPLETED").tone).toBe("live");
    expect(row("COMPLETE", "COMPLETED").tone).toBe("complete");
    expect(row("IN_PROGRESS", "COMPLETED").tone).toBe("live");
    expect(row("EXTANT", "PENDING", false).tone).toBe("neutral");
  });
});
