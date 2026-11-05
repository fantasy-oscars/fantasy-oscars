import { describe, expect, it } from "vitest";
import { statusTone } from "../../../src/decisions/statusTone";
import {
  computeSeasonLifecycleLabelFromRow,
  computeSeasonProgression
} from "../../../src/decisions/season";
import { buildSeasonIndexCards } from "../../../src/decisions/seasons/seasonIndexCards";
import { computeLandingSeasonStatus, titleCase } from "../../../src/decisions/landing";

describe("statusTone", () => {
  it.each([
    ["Pre-draft", "neutral", null],
    ["Closed", "neutral", null],
    ["Open", "neutral", null],
    ["Draft Not Started", "neutral", null],
    ["Drafting", "drafting", "dot"],
    ["Draft Live", "drafting", "dot"],
    ["Paused", "drafting", "pause"],
    ["Draft Paused", "drafting", "pause"],
    ["Draft complete", "complete", "check"],
    ["Draft Complete", "complete", "check"],
    ["Complete", "complete", "check"],
    ["In progress", "live", "dot"]
  ] as const)("%s reads %s with mark %s", (label, tone, mark) => {
    expect(statusTone(label)).toEqual({ tone, mark });
  });

  it("ignores case and surrounding space, and treats unknown labels as neutral", () => {
    expect(statusTone("  draft live ")).toEqual({ tone: "drafting", mark: "dot" });
    expect(statusTone("Something else")).toEqual({ tone: "neutral", mark: null });
  });

  it("covers every label the season progression returns", () => {
    const cases: Array<[Parameters<typeof computeSeasonProgression>[0], string]> = [
      [{ isArchived: true, draftStatus: null }, "neutral"],
      [{ isArchived: false, draftStatus: "PENDING" }, "neutral"],
      [{ isArchived: false, draftStatus: "LIVE" }, "drafting"],
      [{ isArchived: false, draftStatus: "PAUSED" }, "drafting"],
      [{ isArchived: false, draftStatus: "COMPLETED" }, "complete"]
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
    expect(
      statusTone(
        titleCase(computeLandingSeasonStatus({ draftStatus: "PAUSED", draftId: 1 }).label)
      )
    ).toEqual({ tone: "drafting", mark: "pause" });
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
    expect(row("EXTANT", "COMPLETED").tone).toBe("complete");
    expect(row("COMPLETE", "COMPLETED").tone).toBe("complete");
    expect(row("IN_PROGRESS", "COMPLETED").tone).toBe("live");
    expect(row("EXTANT", "PENDING", false).tone).toBe("neutral");
  });
});
