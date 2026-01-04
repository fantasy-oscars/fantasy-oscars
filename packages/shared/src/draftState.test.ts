import { describe, expect, it } from "vitest";
import {
  DraftStateError,
  draftStates,
  enforceDraftTransition,
  getAllowedTransitionsFrom,
  isValidDraftState,
  validateDraftTransition
} from "./draftState.js";

describe("draftState", () => {
  it("knows valid states", () => {
    draftStates.forEach((state) => {
      expect(isValidDraftState(state)).toBe(true);
    });
    expect(isValidDraftState("UNKNOWN")).toBe(false);
  });

  it("allows valid transitions and returns new state", () => {
    expect(enforceDraftTransition("PENDING", "IN_PROGRESS")).toBe("IN_PROGRESS");
    expect(enforceDraftTransition("IN_PROGRESS", "COMPLETED")).toBe("COMPLETED");
    expect(enforceDraftTransition("IN_PROGRESS", "CANCELLED")).toBe("CANCELLED");
    expect(enforceDraftTransition("PENDING", "CANCELLED")).toBe("CANCELLED");
  });

  it("throws on invalid states", () => {
    expect(() => validateDraftTransition("BOGUS", "PENDING")).toThrow(DraftStateError);
    expect(() => validateDraftTransition("PENDING", "BOGUS")).toThrow(DraftStateError);
  });

  it("throws on same-state transitions", () => {
    expect(() => validateDraftTransition("PENDING", "PENDING")).toThrow(DraftStateError);
  });

  it("throws on disallowed transitions", () => {
    expect(() => validateDraftTransition("COMPLETED", "IN_PROGRESS")).toThrow(
      DraftStateError
    );
    expect(() => validateDraftTransition("COMPLETED", "PENDING")).toThrow(
      DraftStateError
    );
    expect(() => validateDraftTransition("CANCELLED", "IN_PROGRESS")).toThrow(
      DraftStateError
    );
  });

  it("lists allowed transitions per state", () => {
    expect(getAllowedTransitionsFrom("PENDING").sort()).toEqual([
      "CANCELLED",
      "IN_PROGRESS"
    ]);
    expect(getAllowedTransitionsFrom("IN_PROGRESS").sort()).toEqual([
      "CANCELLED",
      "COMPLETED"
    ]);
    expect(getAllowedTransitionsFrom("COMPLETED")).toEqual([]);
    expect(getAllowedTransitionsFrom("CANCELLED")).toEqual([]);
  });
});
