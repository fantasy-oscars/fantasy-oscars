import { describe, expect, it } from "vitest";
import { applyPickOperation, DraftPickError } from "../../src/domain/picks.js";

const basePick = {
  pick_number: 1,
  seat_number: 1,
  round_number: 1,
  nomination_id: "nom-1"
};

describe("applyPickOperation", () => {
  it("allows creating a pick when slot is empty", () => {
    const created = applyPickOperation(null, { kind: "create", pick: basePick });
    expect(created).toEqual(basePick);
  });

  it("rejects creating a pick when slot already filled (indirect modification)", () => {
    expect(() =>
      applyPickOperation(basePick, {
        kind: "create",
        pick: { ...basePick, nomination_id: "nom-2" }
      })
    ).toThrow(DraftPickError);
  });

  it("rejects attempts to update an existing pick", () => {
    expect(() =>
      applyPickOperation(basePick, {
        kind: "update",
        pick: { ...basePick, nomination_id: "nom-2" }
      })
    ).toThrow(DraftPickError);
  });

  it("rejects attempts to delete an existing pick", () => {
    expect(() => applyPickOperation(basePick, { kind: "delete" })).toThrow(
      DraftPickError
    );
  });
});
