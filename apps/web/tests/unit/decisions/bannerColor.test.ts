import { describe, expect, it } from "vitest";
import {
  bannerColor,
  bannerIconName,
  type BannerVariant
} from "@/decisions/chrome/bannerColor";

const variants: BannerVariant[] = ["info", "warning", "success", "error"];

describe("banner colour and icon", () => {
  it("maps each variant to its palette colour", () => {
    expect(bannerColor("info")).toBe("gray");
    expect(bannerColor("warning")).toBe("yellow");
    expect(bannerColor("success")).toBe("teal");
    expect(bannerColor("error")).toBe("red");
  });

  it("maps each variant to its icon", () => {
    expect(bannerIconName("info")).toBe("info");
    expect(bannerIconName("warning")).toBe("warning");
    expect(bannerIconName("success")).toBe("check_circle");
    expect(bannerIconName("error")).toBe("error");
  });

  it("gives every variant a distinct icon so severity is not colour alone", () => {
    expect(new Set(variants.map(bannerIconName)).size).toBe(variants.length);
  });
});
