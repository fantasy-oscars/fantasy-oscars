import { afterEach, describe, expect, it, vi } from "vitest";
import { removeLegacyAuthTokens } from "@/lib/legacyAuthStorage";

describe("removeLegacyAuthTokens", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("removes the stored bearer token and leaves other keys", () => {
    const store = new Map([
      ["fo_auth_token", "abc"],
      ["mantine-color-scheme-value", "dark"]
    ]);
    vi.stubGlobal("window", {
      localStorage: { removeItem: (k: string) => store.delete(k) }
    });
    removeLegacyAuthTokens();
    expect(store.has("fo_auth_token")).toBe(false);
    expect(store.has("mantine-color-scheme-value")).toBe(true);
  });

  it("does not throw when storage access fails", () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("blocked");
      }
    });
    expect(() => removeLegacyAuthTokens()).not.toThrow();
  });
});
