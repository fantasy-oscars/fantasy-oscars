import { describe, expect, it } from "vitest";
import {
  canActivateCircuit,
  ceremoniesByEvent,
  circuitCategoryKindLabel,
  circuitTemplateOptions,
  dateOnlyLabel,
  describeMissingDates,
  effectiveMapping,
  groupEditionsByCeremony,
  isCircuitEditable,
  mappedCeremonyCategories,
  moveInOrder,
  needsStructuralEditConfirm,
  pendingMappingChanges,
  unassociatedCeremonies
} from "@/decisions/admin/circuit";

const edition = (
  id: number,
  saved: number | null,
  suggested: number | null,
  ceremony_id = 1
) => ({
  id,
  ceremony_id,
  circuit_category_id: saved,
  suggested_circuit_category_id: suggested
});

describe("Circuit admin decisions", () => {
  it.each([
    ["DRAFT", true, true, false],
    ["ACTIVE", true, false, true],
    ["ARCHIVED", false, false, false]
  ])(
    "%s: editable %s, activatable %s, confirms structural edits %s",
    (status, editable, activatable, confirms) => {
      expect(isCircuitEditable(status)).toBe(editable);
      expect(canActivateCircuit(status)).toBe(activatable);
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

  it("lists each event with its ceremonies in event order", () => {
    const groups = ceremoniesByEvent(
      [{ id: 20 }, { id: 10 }],
      [
        { ceremony_id: 1, circuit_event_id: 10 },
        { ceremony_id: 2, circuit_event_id: 20 },
        { ceremony_id: 3, circuit_event_id: 10 }
      ]
    );
    expect(
      groups.map((g) => [g.event.id, g.ceremonies.map((c) => c.ceremony_id)])
    ).toEqual([
      [20, [2]],
      [10, [1, 3]]
    ]);
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

  it("moves an id one place and refuses to move past either end", () => {
    expect(moveInOrder([1, 2, 3], 2, -1)).toEqual([2, 1, 3]);
    expect(moveInOrder([1, 2, 3], 2, 1)).toEqual([1, 3, 2]);
    expect(moveInOrder([1, 2, 3], 1, -1)).toBeNull();
    expect(moveInOrder([1, 2, 3], 3, 1)).toBeNull();
    expect(moveInOrder([1, 2, 3], 9, 1)).toBeNull();
  });

  it("offers film and performance templates but not song templates", () => {
    const templates = [
      { id: 1, name: "Best Picture", default_unit_kind: "FILM" },
      { id: 2, name: "Lead Actor", default_unit_kind: "PERFORMANCE" },
      { id: 3, name: "Original Song", default_unit_kind: "SONG" }
    ];
    expect(circuitTemplateOptions(templates).map((t) => t.id)).toEqual([1, 2]);
    expect(circuitCategoryKindLabel("ACTING")).toBe("Acting");
    expect(circuitCategoryKindLabel("FILM")).toBe("Film");
  });

  it("shows the admin's choice, else the saved mapping, else the template suggestion", () => {
    const ids = [21, 22];
    expect(effectiveMapping(edition(1, 21, 22), {}, ids)).toBe(21);
    expect(effectiveMapping(edition(1, null, 22), {}, ids)).toBe(22);
    expect(effectiveMapping(edition(1, 21, 22), { 1: null }, ids)).toBeNull();
    expect(effectiveMapping(edition(1, null, null), { 1: 22 }, ids)).toBe(22);
    // A choice pointing at a removed Circuit category shows as unmapped.
    expect(effectiveMapping(edition(1, null, null), { 1: 99 }, ids)).toBeNull();
  });

  it("saves suggestions and changed choices, and nothing that already matches", () => {
    const ids = [21, 22];
    const editions = [
      edition(1, null, 21), // suggested, not saved
      edition(2, 21, 21), // saved and unchanged
      edition(3, 22, null), // cleared by the admin
      edition(4, null, null) // nothing to save
    ];
    expect(pendingMappingChanges(editions, { 3: null }, ids)).toEqual([
      { categoryEditionId: 1, circuitCategoryId: 21 },
      { categoryEditionId: 3, circuitCategoryId: null }
    ]);
  });

  it("lists every ceremony category mapped to each Circuit category", () => {
    const result = mappedCeremonyCategories(
      [{ id: 21 }, { id: 22 }],
      [{ ceremony_id: 1 }],
      [edition(1, 21, null), edition(2, null, 21), edition(3, null, null)],
      {}
    );
    expect(
      result.map((r) => [r.category.id, r.mapped.map((m) => [m.edition.id, m.unsaved])])
    ).toEqual([
      [
        21,
        [
          [1, false],
          [2, true]
        ]
      ],
      [22, []]
    ]);
  });

  it("shows whole-day dates as stored", () => {
    expect(dateOnlyLabel("2027-01-11")).toBe("2027-01-11");
    expect(dateOnlyLabel(null)).toBe("No date");
  });
});
