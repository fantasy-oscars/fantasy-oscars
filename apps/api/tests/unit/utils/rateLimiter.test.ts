import { describe, expect, it } from "vitest";
import { SlidingWindowRateLimiter } from "../../../src/utils/rateLimiter.js";

describe("SlidingWindowRateLimiter", () => {
  it("rejects when max exceeded within window", () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 1000, max: 2 });
    expect(limiter.allow("k", 0)).toBe(true);
    expect(limiter.allow("k", 100)).toBe(true);
    expect(limiter.allow("k", 200)).toBe(false);
  });

  it("allows after window elapses", () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 1000, max: 1 });
    expect(limiter.allow("k", 0)).toBe(true);
    expect(limiter.allow("k", 500)).toBe(false);
    expect(limiter.allow("k", 1200)).toBe(true);
  });
});

describe("SlidingWindowRateLimiter cleanup", () => {
  const hitsOf = (limiter: SlidingWindowRateLimiter) =>
    (limiter as unknown as { hits: Map<string, number[]> }).hits;

  it("removes a key once all its timestamps have expired and no new hit is recorded", () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 1000, max: 0 });
    const hits = hitsOf(limiter);
    hits.set("stale", [0]);
    expect(limiter.allow("stale", 5000)).toBe(false);
    expect(hits.has("stale")).toBe(false);
  });

  it("sweeps expired keys that are never requested again", () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 1000, max: 5 });
    const hits = hitsOf(limiter);
    limiter.allow("never-again", 0);
    limiter.allow("other", 500);
    expect(hits.has("never-again")).toBe(true);
    limiter.allow("trigger", 5000);
    expect(hits.has("never-again")).toBe(false);
    expect(hits.has("other")).toBe(false);
    expect(hits.has("trigger")).toBe(true);
  });

  it("reset clears everything", () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 1000, max: 5 });
    limiter.allow("a", 0);
    limiter.reset();
    expect(hitsOf(limiter).size).toBe(0);
  });

  it("keeps keys with live timestamps", () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 1000, max: 1 });
    limiter.allow("a", 0);
    expect(limiter.allow("a", 500)).toBe(false);
    expect(hitsOf(limiter).has("a")).toBe(true);
  });
});
