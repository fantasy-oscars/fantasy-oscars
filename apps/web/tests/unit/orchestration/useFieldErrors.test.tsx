import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useFieldErrors } from "@/orchestration/useFieldErrors";

describe("useFieldErrors", () => {
  it("reports true and stores the message when the server names fields", () => {
    const { result } = renderHook(() => useFieldErrors());
    let shown = false;
    act(() => {
      shown = result.current.applyFailure({
        errorCode: "VALIDATION_ERROR",
        errorFields: ["pick_timer_seconds"],
        error: "Pick timer must be zero or a positive number of seconds"
      });
    });
    expect(shown).toBe(true);
    expect(result.current.errors.pick_timer_seconds).toBeDefined();

    act(() => result.current.clear("pick_timer_seconds"));
    expect(result.current.errors).toEqual({});
  });

  it("reports false for a failure with no field so the caller can notify", () => {
    const { result } = renderHook(() => useFieldErrors());
    for (const failure of [
      { errorCode: "INTERNAL_ERROR", error: "Something went wrong on our side." },
      { errorCode: "FORBIDDEN", error: "You do not have permission to do that." },
      { errorCode: "VALIDATION_ERROR", error: "Bad", errorFields: [] }
    ]) {
      let shown = true;
      act(() => {
        shown = result.current.applyFailure(failure);
      });
      expect(shown).toBe(false);
      expect(result.current.errors).toEqual({});
    }
  });
});
