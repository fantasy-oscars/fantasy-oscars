import { describe, expect, it } from "vitest";
import { registerCache, resetAllCaches, TtlCache } from "../../../src/utils/ttlCache.js";

describe("TtlCache", () => {
  it("returns a value until its time-to-live elapses", () => {
    const cache = new TtlCache<string>({ ttlMs: 1000, maxEntries: 10 });
    cache.set("k", "v", 0);
    expect(cache.get("k", 999)).toBe("v");
    expect(cache.get("k", 1000)).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("evicts the oldest entry once full", () => {
    const cache = new TtlCache<number>({ ttlMs: 1000, maxEntries: 2 });
    cache.set("a", 1, 0);
    cache.set("b", 2, 0);
    cache.set("a", 3, 1);
    cache.set("c", 4, 2);
    expect(cache.get("b", 3)).toBeUndefined();
    expect(cache.get("a", 3)).toBe(3);
    expect(cache.get("c", 3)).toBe(4);
  });

  it("clears every registered cache", () => {
    const cache = registerCache(new TtlCache<number>({ ttlMs: 1000, maxEntries: 2 }));
    cache.set("a", 1);
    resetAllCaches();
    expect(cache.size).toBe(0);
  });
});
