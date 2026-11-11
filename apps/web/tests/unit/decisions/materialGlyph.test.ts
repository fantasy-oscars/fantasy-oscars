import { describe, expect, it } from "vitest";
import { materialGlyph } from "@/decisions/admin/materialGlyph";

describe("materialGlyph", () => {
  it("treats a Private Use Area code point as a glyph", () => {
    expect(materialGlyph("e87c")).toBe(String.fromCharCode(0xe87c));
  });

  it("accepts an uppercase code point", () => {
    expect(materialGlyph("E87C")).toBe(String.fromCharCode(0xe87c));
  });

  it("treats four hex letters outside the Private Use Area as a ligature name", () => {
    expect(materialGlyph("face")).toBe("face");
    expect(materialGlyph("cafe")).toBe("cafe");
    expect(materialGlyph("fade")).toBe("fade");
  });

  it("returns the fallback for an empty value", () => {
    expect(materialGlyph("")).toBe("trophy");
    expect(materialGlyph(null)).toBe("trophy");
    expect(materialGlyph("", "movie")).toBe("movie");
  });

  it("lowercases a ligature name", () => {
    expect(materialGlyph("Local_Movies")).toBe("local_movies");
  });

  it("returns the fallback for a value that is not a name", () => {
    expect(materialGlyph("not a glyph!")).toBe("trophy");
  });
});
