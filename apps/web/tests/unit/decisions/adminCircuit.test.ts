import { describe, expect, it } from "vitest";
import {
  canActivateCircuit,
  chooseMappingRow,
  circuitCategoryKindLabel,
  circuitTemplateOptions,
  dateOnlyLabel,
  describeMissingDates,
  effectiveMapping,
  isCircuitEditable,
  mappingModalRows,
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
      "BAFTA 2027: ceremony date",
      "oscars-2027: nominations date, ceremony date"
    ]);
  });

  it("offers only ceremonies not yet associated", () => {
    const all = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(unassociatedCeremonies(all, [2])).toEqual([{ id: 1 }, { id: 3 }]);
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

  it("maps two Golden Globes-style categories to one Circuit category, each to one row only", () => {
    // 51 and 52 both come from the Actor template (21); 53 is saved to Actress (22).
    const ids = [21, 22];
    const editions = [edition(51, null, 21), edition(52, null, 21), edition(53, 22, 22)];
    const rows = mappingModalRows(ids, editions, {});
    expect(rows.map((r) => [r.circuitCategoryId, r.selected.map((e) => e.id)])).toEqual([
      [21, [51, 52]],
      [22, [53]]
    ]);
    // A category chosen in one row is not offered in the other.
    expect(rows.map((r) => r.options.map((e) => e.id))).toEqual([[51, 52], [53]]);

    // Dropping 52 from Actor frees it; choosing it for Actress takes it from Actor.
    const freed = chooseMappingRow(editions, {}, ids, 21, [51]);
    expect(freed).toEqual({ 51: 21, 52: null });
    expect(mappingModalRows(ids, editions, freed)[1]!.options.map((e) => e.id)).toEqual([
      52, 53
    ]);
    const moved = chooseMappingRow(editions, freed, ids, 22, [53, 52]);
    expect(
      mappingModalRows(ids, editions, moved).map((r) => r.selected.map((e) => e.id))
    ).toEqual([[51], [52, 53]]);
    expect(pendingMappingChanges(editions, moved, ids)).toEqual([
      { categoryEditionId: 51, circuitCategoryId: 21 },
      { categoryEditionId: 52, circuitCategoryId: 22 }
    ]);
  });

  it("shows whole-day dates as stored", () => {
    expect(dateOnlyLabel("2027-01-11")).toBe("2027-01-11");
    expect(dateOnlyLabel(null)).toBe("No date");
  });
});
