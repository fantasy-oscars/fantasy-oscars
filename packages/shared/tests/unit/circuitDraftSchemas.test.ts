import { describe, expect, it } from "vitest";
import {
  circuitDraftPickBody,
  circuitQueueAddBody,
  circuitQueueItemParams,
  circuitQueueOrderBody
} from "../../src/schemas/index.js";

const message = (result: { error?: { issues: Array<{ message: string }> } }) =>
  result.error?.issues[0]?.message;

describe("circuit draft schemas", () => {
  it("a pick takes a selection id and a request id", () => {
    expect(
      circuitDraftPickBody.parse({ selection_id: "4", request_id: " r-1 " })
    ).toEqual({ selection_id: 4, request_id: "r-1" });
  });

  it("refuses a pick without a selection or a request id", () => {
    expect(message(circuitDraftPickBody.safeParse({ request_id: "r-1" }))).toBe(
      "Choose a contender to draft"
    );
    expect(message(circuitDraftPickBody.safeParse({ selection_id: 4 }))).toBe(
      "Something went wrong. Please reload and try again."
    );
    expect(
      message(
        circuitDraftPickBody.safeParse({ selection_id: 4, request_id: "x".repeat(129) })
      )
    ).toBe("Something went wrong. Please reload and try again.");
  });

  it("a queue add takes a selection id", () => {
    expect(circuitQueueAddBody.parse({ selection_id: "7" })).toEqual({ selection_id: 7 });
    expect(message(circuitQueueAddBody.safeParse({}))).toBe(
      "Choose a contender to queue"
    );
  });

  it("a queue order is a list of selection ids, possibly empty", () => {
    expect(circuitQueueOrderBody.parse({ selection_ids: [3, "1"] })).toEqual({
      selection_ids: [3, 1]
    });
    expect(circuitQueueOrderBody.parse({ selection_ids: [] })).toEqual({
      selection_ids: []
    });
    expect(circuitQueueOrderBody.safeParse({ selection_ids: "3" }).success).toBe(false);
    expect(circuitQueueOrderBody.safeParse({ selection_ids: [0] }).success).toBe(false);
  });

  it("a queue item path carries the league and the selection", () => {
    expect(circuitQueueItemParams.parse({ id: "2", selectionId: "9" })).toEqual({
      id: 2,
      selectionId: 9
    });
    expect(circuitQueueItemParams.safeParse({ id: "2", selectionId: "x" }).success).toBe(
      false
    );
  });
});
