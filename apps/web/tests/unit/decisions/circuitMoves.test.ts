import { describe, expect, it } from "vitest";
import {
  circuitMoveLine,
  circuitMoveOrder,
  type CircuitMoveKind
} from "@/decisions/circuitMoves";

describe("circuit move lines", () => {
  it("names each move and gives its glyph and pill state", () => {
    const kinds: CircuitMoveKind[] = [
      "added",
      "dropped",
      "claim",
      "claimDrop",
      "lostClaim",
      "lostDrop"
    ];
    expect(kinds.map((k) => circuitMoveLine(k))).toEqual([
      { glyph: "add", label: "Added", pillState: "default" },
      { glyph: "remove", label: "Dropped", pillState: "dropped" },
      { glyph: "add", label: "Claim", pillState: "default" },
      { glyph: "remove", label: "Drop if the claim wins", pillState: "dropped" },
      { glyph: "add", label: "Claimed, lost", pillState: "muted" },
      { glyph: "remove", label: "Would have dropped", pillState: "muted" }
    ]);
  });

  it("puts the added line first, then the dropped line", () => {
    expect(
      circuitMoveOrder([
        { kind: "dropped" as const, id: 1 },
        { kind: "added" as const, id: 2 }
      ]).map((m) => m.id)
    ).toEqual([2, 1]);
    expect(
      circuitMoveOrder([
        { kind: "lostDrop" as const, id: 1 },
        { kind: "lostClaim" as const, id: 2 }
      ]).map((m) => m.id)
    ).toEqual([2, 1]);
    expect(circuitMoveOrder([{ kind: "claimDrop" as const }])).toHaveLength(1);
  });
});
