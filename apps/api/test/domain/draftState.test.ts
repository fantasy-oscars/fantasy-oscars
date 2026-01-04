import { describe, expect, it } from "vitest";
import { DraftStateError } from "@fantasy-oscars/shared";
import {
  allowedTransitions,
  applyDraftStateTransition,
  mapDraftStateError,
  transitionDraftState
} from "../../src/domain/draftState.js";

describe("transitionDraftState", () => {
  it("allows valid transitions and stamps timestamps", () => {
    const fixed = new Date("2024-01-01T00:00:00Z");
    const draft = {
      id: 1,
      status: "PENDING" as const,
      started_at: null,
      completed_at: null
    };
    const inProgress = transitionDraftState(draft, "IN_PROGRESS", () => fixed);
    expect(inProgress.status).toBe("IN_PROGRESS");
    expect(inProgress.started_at).toEqual(fixed);
    expect(inProgress.completed_at).toBeNull();

    const completed = transitionDraftState(inProgress, "COMPLETED", () => fixed);
    expect(completed.status).toBe("COMPLETED");
    expect(completed.completed_at).toEqual(fixed);
  });

  it("rejects invalid transitions with a DraftStateError", () => {
    expect(() =>
      transitionDraftState({ id: 1, status: "COMPLETED" as const }, "IN_PROGRESS")
    ).toThrow(DraftStateError);
    const err = mapDraftStateError(
      (() => {
        try {
          transitionDraftState({ id: 1, status: "PENDING" as const }, "PENDING");
        } catch (e) {
          return e;
        }
        return undefined;
      })()
    );
    expect(err?.code).toBe("SAME_STATE");
  });
});

describe("allowedTransitions", () => {
  it("lists allowed next states", () => {
    expect(allowedTransitions("PENDING").sort()).toEqual(["CANCELLED", "IN_PROGRESS"]);
    expect(allowedTransitions("IN_PROGRESS").sort()).toEqual(["CANCELLED", "COMPLETED"]);
    expect(allowedTransitions("COMPLETED")).toEqual([]);
  });
});

describe("applyDraftStateTransition", () => {
  it("delegates to transitionDraftState", () => {
    const fixed = new Date("2024-01-01T00:00:00Z");
    const draft = {
      id: 1,
      status: "PENDING" as const,
      started_at: null,
      completed_at: null
    };
    const next = applyDraftStateTransition(draft, "IN_PROGRESS", () => fixed);
    expect(next.status).toBe("IN_PROGRESS");
    expect(next.started_at).toEqual(fixed);
  });
});
