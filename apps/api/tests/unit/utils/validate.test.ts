import { describe, expect, it } from "vitest";
import { idParam, z } from "@fantasy-oscars/shared/schemas";
import { AppError } from "../../../src/errors.js";
import { parseBody, parseParams, parseQuery } from "../../../src/utils/validate.js";

function catchError(fn: () => unknown): AppError {
  try {
    fn();
  } catch (err) {
    return err as AppError;
  }
  throw new Error("expected throw");
}

describe("request parsing helpers", () => {
  const schema = z.object({
    name: z.string("Missing name"),
    count: z.number("Bad count")
  });

  it("returns parsed data", () => {
    expect(parseBody(schema, { name: "a", count: 2, extra: 1 })).toEqual({
      name: "a",
      count: 2
    });
  });

  it("treats a missing body as an empty object", () => {
    const err = catchError(() => parseBody(schema, undefined));
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.status).toBe(400);
    expect(err.details).toEqual({ fields: ["name", "count"] });
  });

  it("uses the first issue message and top-level paths as fields", () => {
    const err = catchError(() => parseBody(schema, { name: "a", count: "x" }));
    expect(err.message).toBe("Bad count");
    expect(err.details).toEqual({ fields: ["count"] });
  });

  it("honours message and fields overrides", () => {
    const err = catchError(() =>
      parseParams(idParam, { id: "abc" }, { message: "Invalid ids", fields: ["id", "x"] })
    );
    expect(err.message).toBe("Invalid ids");
    expect(err.details).toEqual({ fields: ["id", "x"] });
  });

  it("prefers fields named by a custom issue", () => {
    const custom = z.object({ a: z.string() }).superRefine((_v, ctx) => {
      ctx.addIssue({ code: "custom", message: "bad", params: { fields: ["a", "b"] } });
    });
    const err = catchError(() => parseBody(custom, { a: "x" }, { fields: ["z"] }));
    expect(err.details).toEqual({ fields: ["a", "b"] });
  });

  it("omits fields when the failure has no path", () => {
    const err = catchError(() => parseQuery(z.string("Bad query"), 5));
    expect(err.message).toBe("Bad query");
    expect(err.details).toBeUndefined();
  });

  it("parses positive integer ids from strings", () => {
    expect(parseParams(idParam, { id: "42" })).toEqual({ id: 42 });
    for (const bad of ["0", "-1", "1.5", "abc", "", "1e3"]) {
      expect(catchError(() => parseParams(idParam, { id: bad })).code).toBe(
        "VALIDATION_ERROR"
      );
    }
  });
});
