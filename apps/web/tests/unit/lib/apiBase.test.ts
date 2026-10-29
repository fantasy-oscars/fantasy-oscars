import { describe, expect, it } from "vitest";
import {
  buildApiUrl,
  buildSocketTarget,
  isRelativeApiBase,
  normalizeApiBase
} from "@/lib/apiBase";

describe("normalizeApiBase", () => {
  it("trims whitespace and trailing slashes, defaulting to empty", () => {
    expect(normalizeApiBase(undefined)).toBe("");
    expect(normalizeApiBase("  /api/ ")).toBe("/api");
    expect(normalizeApiBase("https://api.example.com/")).toBe("https://api.example.com");
  });
});

describe("isRelativeApiBase", () => {
  it("is true only for root-relative paths", () => {
    expect(isRelativeApiBase("/api")).toBe(true);
    expect(isRelativeApiBase("")).toBe(false);
    expect(isRelativeApiBase("https://api.example.com")).toBe(false);
    expect(isRelativeApiBase("//api.example.com")).toBe(false);
  });
});

describe("buildApiUrl", () => {
  it("builds absolute and same-origin URLs", () => {
    expect(buildApiUrl("https://api.example.com", "/auth/me")).toBe(
      "https://api.example.com/auth/me"
    );
    expect(buildApiUrl("/api", "/auth/me")).toBe("/api/auth/me");
    expect(buildApiUrl("", "/auth/me")).toBe("/auth/me");
  });
});

describe("buildSocketTarget", () => {
  const origin = "https://www.example.com";

  it("uses the web origin and a prefixed engine path for a relative base", () => {
    expect(buildSocketTarget("/api", "/drafts", origin)).toEqual({
      url: "https://www.example.com/drafts",
      path: "/api/socket.io"
    });
  });

  it("uses the API origin and default path for an absolute base", () => {
    expect(buildSocketTarget("https://api.example.com", "/drafts", origin)).toEqual({
      url: "https://api.example.com/drafts"
    });
  });

  it("uses the web origin and default path when the base is empty", () => {
    expect(buildSocketTarget("", "/drafts", origin)).toEqual({
      url: "https://www.example.com/drafts"
    });
  });
});
