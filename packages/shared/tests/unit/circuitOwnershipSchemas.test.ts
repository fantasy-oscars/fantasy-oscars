import { describe, expect, it } from "vitest";
import { circuitDropBody, circuitFreeAgentBody } from "../../src/schemas/index.js";

const message = (result: { error?: { issues: Array<{ message: string }> } }) =>
  result.error?.issues[0]?.message;

describe("circuit ownership schemas", () => {
  it("a drop takes a selection id", () => {
    expect(circuitDropBody.parse({ selection_id: "4" })).toEqual({ selection_id: 4 });
    expect(message(circuitDropBody.safeParse({}))).toBe("Choose a contender to drop");
  });

  it("a free-agent add takes an optional drop", () => {
    expect(circuitFreeAgentBody.parse({ selection_id: 4 })).toEqual({
      selection_id: 4,
      drop_selection_id: null
    });
    expect(
      circuitFreeAgentBody.parse({ selection_id: 4, drop_selection_id: "7" })
    ).toEqual({ selection_id: 4, drop_selection_id: 7 });
    expect(message(circuitFreeAgentBody.safeParse({ drop_selection_id: 7 }))).toBe(
      "Choose a contender to add"
    );
  });

  it("refuses dropping the contender being added", () => {
    expect(
      message(circuitFreeAgentBody.safeParse({ selection_id: 4, drop_selection_id: 4 }))
    ).toBe("Choose a different contender to drop");
  });
});
