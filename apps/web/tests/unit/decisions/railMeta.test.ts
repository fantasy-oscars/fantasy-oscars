import { describe, expect, it } from "vitest";
import { railMetaCh } from "@/decisions/draft/railMeta";

describe("railMetaCh", () => {
  it("is three for an empty rail", () => {
    expect(railMetaCh([])).toBe(3);
  });

  it("never drops below three for short labels", () => {
    expect(railMetaCh(["1-1", "1-2", "—"])).toBe(3);
  });

  it("follows the longest round-pick label", () => {
    expect(railMetaCh(["1-1", "10-12", "2-3"])).toBe(5);
    expect(railMetaCh(["12-10"])).toBe(5);
  });

  it("ignores missing labels", () => {
    expect(railMetaCh([null, undefined, "1-1"])).toBe(3);
  });
});
