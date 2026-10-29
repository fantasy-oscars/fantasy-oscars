import { describe, expect, it } from "vitest";
import { clearFieldError, fieldErrorsFromFailure } from "@/decisions/fieldErrors";

describe("fieldErrorsFromFailure", () => {
  it("puts the server message on every field it names", () => {
    expect(
      fieldErrorsFromFailure({
        errorCode: "VALIDATION_ERROR",
        errorFields: ["username", "email"],
        error: "Some of the details you entered are not valid"
      })
    ).toEqual({
      username: "Some of the details you entered are not valid",
      email: "Some of the details you entered are not valid"
    });
  });

  it("renames API fields to input names through aliases", () => {
    expect(
      fieldErrorsFromFailure(
        { errorCode: "VALIDATION_ERROR", errorFields: ["starts_at"], error: "Bad date" },
        { starts_at: "startsAtLocal" }
      )
    ).toEqual({ startsAtLocal: "Bad date" });
  });

  it("yields nothing for other failures or missing fields", () => {
    expect(
      fieldErrorsFromFailure({ errorCode: "FORBIDDEN", errorFields: ["x"], error: "No" })
    ).toEqual({});
    expect(
      fieldErrorsFromFailure({ errorCode: "VALIDATION_ERROR", error: "Bad" })
    ).toEqual({});
    expect(
      fieldErrorsFromFailure({ errorCode: "VALIDATION_ERROR", errorFields: ["a"] })
    ).toEqual({});
  });
});

describe("clearFieldError", () => {
  it("drops only the named input", () => {
    expect(clearFieldError({ a: "x", b: "y" }, "a")).toEqual({ b: "y" });
  });

  it("returns the same object when the input has no error", () => {
    const errors = { a: "x" };
    expect(clearFieldError(errors, "b")).toBe(errors);
  });
});
