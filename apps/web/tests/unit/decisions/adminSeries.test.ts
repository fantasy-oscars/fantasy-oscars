import { describe, expect, it } from "vitest";
import {
  canActivateSeries,
  dateOnlyLabel,
  describeMissingDates,
  groupEditionsByCeremony,
  isSeriesEditable,
  needsStructuralEditConfirm,
  unassociatedCeremonies
} from "@/decisions/admin/series";

describe("Series admin decisions", () => {
  it.each([
    ["DRAFT", true, true, false],
    ["ACTIVE", true, false, true],
    ["ARCHIVED", false, false, false]
  ])(
    "%s: editable %s, activatable %s, confirms structural edits %s",
    (status, editable, activatable, confirms) => {
      expect(isSeriesEditable(status)).toBe(editable);
      expect(canActivateSeries(status)).toBe(activatable);
      expect(needsStructuralEditConfirm(status)).toBe(confirms);
    }
  );

  it("describes each ceremony that lacks a date", () => {
    expect(
      describeMissingDates([
        {
          ceremony_id: 1,
          ceremony_name: "BAFTA 2027",
          ceremony_code: "bafta-2027",
          missing: ["results_on"]
        },
        {
          ceremony_id: 2,
          ceremony_name: null,
          ceremony_code: "oscars-2027",
          missing: ["nominations_on", "results_on"]
        }
      ])
    ).toEqual([
      "BAFTA 2027: results date",
      "oscars-2027: nominations date, results date"
    ]);
  });

  it("offers only ceremonies not yet associated", () => {
    const all = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(unassociatedCeremonies(all, [2])).toEqual([{ id: 1 }, { id: 3 }]);
  });

  it("groups category editions under their ceremony in ceremony order", () => {
    const groups = groupEditionsByCeremony(
      [{ ceremony_id: 9 }, { ceremony_id: 4 }],
      [
        { id: 1, ceremony_id: 4 },
        { id: 2, ceremony_id: 9 },
        { id: 3, ceremony_id: 4 }
      ]
    );
    expect(
      groups.map((g) => [g.ceremony.ceremony_id, g.editions.map((e) => e.id)])
    ).toEqual([
      [9, [2]],
      [4, [1, 3]]
    ]);
  });

  it("shows whole-day dates as stored", () => {
    expect(dateOnlyLabel("2027-01-11")).toBe("2027-01-11");
    expect(dateOnlyLabel(null)).toBe("No date");
  });
});
