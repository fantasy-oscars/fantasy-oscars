// @vitest-environment node
import { describe, expect, it } from "vitest";
import { resolveEnableAllBrands } from "../../../vite/brandInit";

describe("resolveEnableAllBrands", () => {
  it("is off when the flag is unset or not 1", () => {
    expect(resolveEnableAllBrands("production", undefined)).toBe(false);
    expect(resolveEnableAllBrands("test", "0")).toBe(false);
  });

  it("is on for non-production modes when the flag is 1", () => {
    expect(resolveEnableAllBrands("development", "1")).toBe(true);
    expect(resolveEnableAllBrands("test", "1")).toBe(true);
  });

  it("refuses a production build with the flag set", () => {
    expect(() => resolveEnableAllBrands("production", "1")).toThrow(
      /not allowed in a production build/
    );
  });
});
